import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const postMessageSchema = z
  .object({
    content: z.string().optional().default(""),
    imageUrl: z.string().nullable().optional(),
  })
  .refine(
    (data) =>
      (data.content && data.content.trim().length > 0) ||
      (data.imageUrl && data.imageUrl.trim().length > 0),
    { message: "Message must contain text content or an image" }
  );

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    // Verify current user is a participant of this conversation
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: params.id,
          userId: user.userId,
        },
      },
    });

    if (!participant) {
      return jsonError("You are not a participant of this conversation", "FORBIDDEN", 403);
    }

    // Update lastReadAt for the participant
    const now = new Date();
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: params.id,
          userId: user.userId,
        },
      },
      data: {
        lastReadAt: now,
      },
    });

    // Fetch conversation details and messages
    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { id: true, name: true, role: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    if (!conversation) {
      return jsonError("Conversation not found", "NOT_FOUND", 404);
    }

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: params.id },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    const otherUser =
      conversation.type === "DIRECT"
        ? conversation.participants.find((p) => p.userId !== user.userId)?.user || null
        : null;

    const computedName =
      conversation.type === "GROUP"
        ? conversation.name || "Group Chat"
        : otherUser?.name || "Direct Chat";

    return jsonSuccess({
      conversation: {
        ...conversation,
        name: computedName,
        otherUser,
        participantsCount: conversation.participants.length,
      },
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        content: m.content,
        imageUrl: m.imageUrl,
        createdAt: m.createdAt,
        senderId: m.senderId,
        isMine: m.senderId === user.userId,
        sender: m.sender || { id: m.senderId, name: "User", role: "USER", email: "" },
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    // Verify current user is a participant of this conversation
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: params.id,
          userId: user.userId,
        },
      },
    });

    if (!participant) {
      return jsonError("You are not a participant of this conversation", "FORBIDDEN", 403);
    }

    const body = await req.json();
    const parsed = postMessageSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.errors[0]?.message || "Invalid message payload", "BAD_REQUEST", 400);
    }

    const now = new Date();
    const textContent = (parsed.data.content || "").trim();
    const imageUrl = parsed.data.imageUrl ? parsed.data.imageUrl.trim() : null;

    // Create the message
    const message = await prisma.chatMessage.create({
      data: {
        conversationId: params.id,
        senderId: user.userId,
        content: textContent || (imageUrl ? "[Photo]" : ""),
        imageUrl,
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    // Update conversation updatedAt timestamp and sender lastReadAt
    await prisma.conversation.update({
      where: { id: params.id },
      data: { updatedAt: now },
    });

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: params.id,
          userId: user.userId,
        },
      },
      data: { lastReadAt: now },
    });

    return jsonSuccess({
      message: {
        id: message.id,
        conversationId: message.conversationId,
        content: message.content,
        imageUrl: message.imageUrl,
        createdAt: message.createdAt,
        senderId: message.senderId,
        isMine: true,
        sender: message.sender,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
