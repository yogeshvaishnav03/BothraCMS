import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const participantRecords = await prisma.conversationParticipant.findMany({
      where: {
        userId: user.userId,
        conversation: {
          organizationId: user.organizationId,
        },
      },
      select: {
        conversationId: true,
        lastReadAt: true,
      },
    });

    if (participantRecords.length === 0) {
      return jsonSuccess({ unreadCount: 0, latestMessage: null });
    }

    const unreadPerConv = await Promise.all(
      participantRecords.map(async (record) => {
        return prisma.chatMessage.count({
          where: {
            conversationId: record.conversationId,
            senderId: { not: user.userId },
            ...(record.lastReadAt ? { createdAt: { gt: record.lastReadAt } } : {}),
          },
        });
      })
    );

    const totalUnread = unreadPerConv.reduce((a, b) => a + b, 0);

    let latestMessage: { id: string; senderName: string; content: string; createdAt: string } | null = null;
    if (totalUnread > 0) {
      const convIds = participantRecords.map((p) => p.conversationId);
      const latest = await prisma.chatMessage.findFirst({
        where: {
          conversationId: { in: convIds },
          senderId: { not: user.userId },
        },
        orderBy: { createdAt: "desc" },
        include: {
          sender: { select: { name: true, role: true } },
        },
      });

      if (latest) {
        latestMessage = {
          id: latest.id,
          senderName: latest.sender?.name || "Team Member",
          content: latest.content.length > 80 ? latest.content.slice(0, 80) + "..." : latest.content,
          createdAt: latest.createdAt.toISOString(),
        };
      }
    }

    return jsonSuccess({
      unreadCount: totalUnread,
      latestMessage,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
