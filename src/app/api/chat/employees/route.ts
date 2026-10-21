import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    // Fetch all active employees/users in the organization
    const employees = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        jobTitle: true,
        lastLoginAt: true,
      },
      orderBy: [
        { role: "asc" },
        { name: "asc" },
      ],
    });

    // Also get existing direct conversations for current user to link easily
    const existingDirects = await prisma.conversationParticipant.findMany({
      where: {
        userId: user.userId,
        conversation: {
          type: "DIRECT",
          organizationId: user.organizationId,
        },
      },
      select: {
        conversationId: true,
        conversation: {
          select: {
            id: true,
            participants: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    const directMap: Record<string, string> = {};
    for (const p of existingDirects) {
      const other = p.conversation.participants.find((x) => x.userId !== user.userId);
      if (other) {
        directMap[other.userId] = p.conversationId;
      }
    }

    const enriched = employees.map((emp) => ({
      ...emp,
      isCurrentUser: emp.id === user.userId,
      existingConversationId: directMap[emp.id] || null,
    }));

    return jsonSuccess({
      currentUser: {
        id: user.userId,
        name: user.name,
        role: user.role,
        isSuperAdmin: user.role === "SUPER_ADMIN",
      },
      employees: enriched,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
