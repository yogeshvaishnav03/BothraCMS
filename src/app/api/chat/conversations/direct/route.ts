import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const directChatSchema = z.object({
  targetUserId: z.string().min(1, "Target user ID is required"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const parsed = directChatSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.errors[0]?.message || "Invalid payload", "BAD_REQUEST", 400);
    }

    const { targetUserId } = parsed.data;

    if (targetUserId === user.userId) {
      return jsonError("Cannot start a direct conversation with yourself", "BAD_REQUEST", 400);
    }

    // Verify target user is in the same organization
    const targetUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId: user.organizationId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!targetUser) {
      return jsonError("Employee not found in organization", "NOT_FOUND", 404);
    }

    // Check if an existing 1-on-1 DIRECT conversation already exists between both users
    const existing = await prisma.conversation.findFirst({
      where: {
        organizationId: user.organizationId,
        type: "DIRECT",
        AND: [
          { participants: { some: { userId: user.userId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    if (existing) {
      return jsonSuccess({
        conversation: {
          ...existing,
          name: targetUser.name,
          otherUser: targetUser,
          participantsCount: existing.participants.length,
        },
        isNew: false,
      });
    }

    // Create a new direct 1-to-1 conversation (NO group created)
    const newConversation = await prisma.conversation.create({
      data: {
        organizationId: user.organizationId,
        type: "DIRECT",
        createdById: user.userId,
        participants: {
          create: [
            { userId: user.userId },
            { userId: targetUserId },
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    return jsonSuccess({
      conversation: {
        ...newConversation,
        name: targetUser.name,
        otherUser: targetUser,
        participantsCount: 2,
      },
      isNew: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
