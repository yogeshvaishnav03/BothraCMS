import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { isSafeMediaUrl } from "@/lib/upload-validation";
import { pushToPeople } from "@/lib/push";

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

const updateMessageSchema = z.object({
  messageId: z.string().min(1, "Message ID is required"),
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
    // Future-buffer timestamp by 2 seconds to absorb any DB server clock skew or sub-millisecond precision race conditions
    const readTimestamp = new Date(Date.now() + 2000);
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: params.id,
          userId: user.userId,
        },
      },
      data: {
        lastReadAt: readTimestamp,
      },
    });

    // Fetch conversation details and messages
    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { id: true, name: true, role: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, phone: true } },
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
        isEdited: Boolean(m.isEdited),
        updatedAt: m.updatedAt,
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
    if (imageUrl && !isSafeMediaUrl(imageUrl)) {
      return jsonError("Invalid image URL: only verified upload URLs or raster images are allowed", "INVALID_MEDIA_URL", 400);
    }

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

    const readTimestamp = new Date(Date.now() + 2000);
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: params.id,
          userId: user.userId,
        },
      },
      data: { lastReadAt: readTimestamp },
    });

    // Push Web Push notifications to other active participants so mobile phones alert when app is backgrounded/closed
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: params.id },
        select: {
          type: true,
          name: true,
          participants: {
            where: { userId: { not: user.userId } },
            select: {
              userId: true,
              user: { select: { status: true } },
            },
          },
        },
      });
      const recipientIds = (conv?.participants || [])
        .filter((p) => p.user?.status === "ACTIVE")
        .map((p) => p.userId);
      if (recipientIds.length > 0) {
        const senderName = message.sender?.name || user.name || "Team Member";
        const convName = conv?.type === "GROUP" ? conv.name || "Group Chat" : "";
        const title =
          conv?.type === "GROUP"
            ? `New message in "${convName}" from ${senderName}`
            : `New message from ${senderName}`;
        const bodyText = textContent || (imageUrl ? "📷 [Photo]" : "New message");
        await pushToPeople(user.organizationId, recipientIds, {
          title,
          body: bodyText,
          href: "/chat",
          tag: `chat:${message.id}`,
        });
      }
    } catch (pushErr) {
      console.warn("[chat] Push notification dispatch failed:", pushErr);
    }

    return jsonSuccess({
      message: {
        id: message.id,
        conversationId: message.conversationId,
        content: message.content,
        imageUrl: message.imageUrl,
        isEdited: Boolean(message.isEdited),
        updatedAt: message.updatedAt,
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


export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
    const parsed = updateMessageSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.errors[0]?.message || "Invalid update payload", "BAD_REQUEST", 400);
    }

    const { messageId, content } = parsed.data;

    // Verify message exists and belongs to this conversation
    const existing = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!existing || existing.conversationId !== params.id) {
      return jsonError("Message not found in this conversation", "NOT_FOUND", 404);
    }

    // Only the original sender can edit the message
    if (existing.senderId !== user.userId) {
      return jsonError("You can only edit your own messages", "FORBIDDEN", 403);
    }

    const now = new Date();
    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content: content.trim(),
        isEdited: true,
        updatedAt: now,
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    // Touch conversation updatedAt
    await prisma.conversation.update({
      where: { id: params.id },
      data: { updatedAt: now },
    });

    return jsonSuccess({
      message: {
        id: updated.id,
        conversationId: updated.conversationId,
        content: updated.content,
        imageUrl: updated.imageUrl,
        isEdited: true,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        senderId: updated.senderId,
        isMine: true,
        sender: updated.sender,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
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

    const { searchParams } = new URL(req.url);
    let messageId = searchParams.get("messageId");
    if (!messageId) {
      try {
        const body = await req.json();
        messageId = body?.messageId;
      } catch {
        // empty body
      }
    }

    if (!messageId) {
      return jsonError("messageId query parameter or body is required", "BAD_REQUEST", 400);
    }

    const existing = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!existing || existing.conversationId !== params.id) {
      return jsonError("Message not found in this conversation", "NOT_FOUND", 404);
    }

    const isAuthor = existing.senderId === user.userId;
    const isAdmin = ["SUPER_ADMIN", "ORG_ADMIN"].includes(user.role);

    if (!isAuthor && !isAdmin) {
      return jsonError("You are not authorized to delete this message", "FORBIDDEN", 403);
    }

    await prisma.chatMessage.delete({
      where: { id: messageId },
    });

    // Touch conversation updatedAt
    await prisma.conversation.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    });

    return jsonSuccess({
      success: true,
      messageId,
      conversationId: params.id,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
