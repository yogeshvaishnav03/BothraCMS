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
                  select: { id: true, name: true, email: true, role: true },
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

    // Compute unread counts and enrich items
    const conversations = await Promise.all(
      participantRecords.map(async (record) => {
        const conv = record.conversation;
        const lastReadAt = record.lastReadAt;

        const unreadCount = await prisma.chatMessage.count({
          where: {
            conversationId: conv.id,
            senderId: { not: user.userId },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });

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
                content: latestMsg.content,
                createdAt: latestMsg.createdAt,
                senderId: latestMsg.senderId,
                senderName: latestMsg.sender?.name || "User",
              }
            : null,
          unreadCount,
        };
      })
    );

    return jsonSuccess({
      conversations,
      isSuperAdmin: user.role === "SUPER_ADMIN",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
