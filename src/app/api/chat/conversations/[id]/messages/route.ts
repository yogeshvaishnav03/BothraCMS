import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const postMessageSchema = z.object({
  content: z.string().min(1, "Message content cannot be empty"),
});

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

    return jsonSuccess({
      conversation: {
        ...conversation,
        otherUser,
      },
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        content: m.content,
        createdAt: m.createdAt,
        senderId: m.senderId,
        isMine: m.senderId === user.userId,
        sender: m.sender,
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

    // Create the message
    const message = await prisma.chatMessage.create({
      data: {
        conversationId: params.id,
        senderId: user.userId,
        content: parsed.data.content.trim(),
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
