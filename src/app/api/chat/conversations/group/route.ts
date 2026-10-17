import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createGroupSchema = z.object({
  name: z.string().min(2, "Group name must be at least 2 characters"),
  description: z.string().optional(),
  memberIds: z.array(z.string()).min(1, "At least one employee member must be selected"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    // Enforce Rule: Only Super Admin can create chat groups!
    if (user.role !== "SUPER_ADMIN") {
      return jsonError(
        "Only Super Admin is authorized to create chat groups. Normal communication is 1-on-1 direct employee chat.",
        "FORBIDDEN",
        403
      );
    }

    const body = await req.json();
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.errors[0]?.message || "Invalid group parameters", "BAD_REQUEST", 400);
    }

    const { name, description, memberIds } = parsed.data;

    // Verify all memberIds belong to this organization
    const validUsers = await prisma.user.findMany({
      where: {
        id: { in: memberIds },
        organizationId: user.organizationId,
        status: "ACTIVE",
      },
      select: { id: true, name: true, role: true },
    });

    if (validUsers.length === 0) {
      return jsonError("No valid employees found for group creation", "BAD_REQUEST", 400);
    }

    // Ensure Super Admin (creator) is in the participant list
    const participantSet = new Set(validUsers.map((u) => u.id));
    participantSet.add(user.userId);
    const allParticipantIds = Array.from(participantSet);

    const groupConversation = await prisma.conversation.create({
      data: {
        organizationId: user.organizationId,
        type: "GROUP",
        name: name.trim(),
        description: description?.trim() || null,
        createdById: user.userId,
        participants: {
          create: allParticipantIds.map((uid) => ({
            userId: uid,
          })),
        },
      },
      include: {
        creator: { select: { id: true, name: true, role: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    // Optionally create an initial system or welcome message
    await prisma.chatMessage.create({
      data: {
        conversationId: groupConversation.id,
        senderId: user.userId,
        content: `👋 Group "${name.trim()}" created by Super Admin ${user.name}.`,
      },
    });

    return jsonSuccess({
      group: groupConversation,
      message: `Group "${name.trim()}" successfully created with ${allParticipantIds.length} members.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
