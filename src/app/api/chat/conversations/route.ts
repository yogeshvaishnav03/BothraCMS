import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    // Fetch conversations where current user is a participant
    const participantRecords = await prisma.conversationParticipant.findMany({
      where: {
        userId: user.userId,
        conversation: {
          organizationId: user.organizationId,
        },
      },
      include: {
        conversation: {
          include: {
            creator: {
              select: { id: true, name: true, role: true },
            },
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, role: true, phone: true },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                sender: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: {
        conversation: {
          updatedAt: "desc",
        },
      },
    });

    // Compute unread counts with at most 2 batched queries instead of N+1 per-conversation counts
    const unreadAllIds: string[] = [];
    const datedRecords: { convId: string; lastReadAt: Date }[] = [];
    let minLastReadAt: Date | null = null;

    for (const record of participantRecords) {
      if (!record.lastReadAt) {
        unreadAllIds.push(record.conversation.id);
      } else {
        datedRecords.push({ convId: record.conversation.id, lastReadAt: record.lastReadAt });
        if (!minLastReadAt || record.lastReadAt < minLastReadAt) {
          minLastReadAt = record.lastReadAt;
        }
      }
    }

    const [allCounts, recentMsgs] = await Promise.all([
      unreadAllIds.length > 0
        ? prisma.chatMessage.groupBy({
            by: ["conversationId"],
            where: {
              conversationId: { in: unreadAllIds },
              senderId: { not: user.userId },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      datedRecords.length > 0 && minLastReadAt
        ? prisma.chatMessage.findMany({
            where: {
              conversationId: { in: datedRecords.map((d) => d.convId) },
              senderId: { not: user.userId },
              createdAt: { gt: minLastReadAt },
            },
            select: { conversationId: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    const unreadByConv = new Map<string, number>();
    for (const row of allCounts) {
      unreadByConv.set(row.conversationId, row._count._all);
    }
    const lastReadMap = new Map(datedRecords.map((d) => [d.convId, d.lastReadAt]));
    for (const msg of recentMsgs) {
      const cutoff = lastReadMap.get(msg.conversationId);
      if (cutoff && msg.createdAt > cutoff) {
        unreadByConv.set(msg.conversationId, (unreadByConv.get(msg.conversationId) || 0) + 1);
      }
    }

    const conversations = participantRecords.map((record) => {
      const conv = record.conversation;
      const unreadCount = unreadByConv.get(conv.id) || 0;

      const otherParticipant =
        conv.type === "DIRECT"
          ? conv.participants.find((p) => p.userId !== user.userId)?.user || null
          : null;

      const latestMsg = conv.messages[0] || null;

      return {
        id: conv.id,
        type: conv.type, // DIRECT or GROUP
        name: conv.type === "GROUP" ? conv.name || "Group Chat" : otherParticipant?.name || "Direct Chat",
        description: conv.description,
        createdById: conv.createdById,
        creator: conv.creator,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        otherUser: otherParticipant,
        participantsCount: conv.participants.length,
        participants: conv.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          role: p.user.role,
        })),
        latestMessage: latestMsg
          ? {
              id: latestMsg.id,
              content:
                latestMsg.imageUrl && (!latestMsg.content || latestMsg.content === "[Photo]")
                  ? "📷 Photo"
                  : latestMsg.content,
              imageUrl: latestMsg.imageUrl,
              createdAt: latestMsg.createdAt,
              senderId: latestMsg.senderId,
              senderName: latestMsg.sender?.name || "User",
            }
          : null,
        unreadCount,
      };
    });

    return jsonSuccess({
      conversations,
      isSuperAdmin: user.role === "SUPER_ADMIN",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
