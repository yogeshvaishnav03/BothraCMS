import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requireProjectAccess, requirePermission, isOrgOwnerOrAdmin } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const assignUserSchema = z.object({
  userId: z.string().min(1),
  role: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    await requireProjectAccess(user, params.id);

    const assignments = await prisma.projectAssignment.findMany({
      where: {
        projectId: params.id,
        organizationId: user.organizationId,
        status: "ACTIVE",
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        assignedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { assignedAt: "desc" },
    });

    return jsonSuccess(assignments);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "projects:write");

    // Only owner/admin or project manager can assign members
    const project = await prisma.project.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
    });
    if (!project) return jsonError("Project not found", "NOT_FOUND", 404);

    if (!isOrgOwnerOrAdmin(user) && project.managerUserId !== user.userId) {
      return jsonError("Only Organization Admins or the Project Manager can assign members", "FORBIDDEN", 403);
    }

    const body = await req.json();
    const data = assignUserSchema.parse(body);

    // Verify target user belongs to same organization
    const targetUser = await prisma.user.findFirst({
      where: { id: data.userId, organizationId: user.organizationId, status: "ACTIVE" },
    });
    if (!targetUser) {
      return jsonError("User not found in organization", "NOT_FOUND", 404);
    }

    const assignment = await prisma.projectAssignment.upsert({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: targetUser.id,
        },
      },
      update: {
        status: "ACTIVE",
        role: data.role || targetUser.role,
        assignedById: user.userId,
        assignedAt: new Date(),
      },
      create: {
        organizationId: user.organizationId,
        projectId: project.id,
        userId: targetUser.id,
        role: data.role || targetUser.role,
        status: "ACTIVE",
        assignedById: user.userId,
        assignedAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    // Audit log
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PROJECT_ASSIGNMENT_CREATED",
        entityType: "PROJECT_ASSIGNMENT",
        entityId: assignment.id,
        afterJson: JSON.stringify({
          projectId: project.id,
          projectName: project.name,
          userId: targetUser.id,
          userName: targetUser.name,
          role: assignment.role,
        }),
        reason: `Assigned ${targetUser.name} (${targetUser.role}) to project ${project.name}`,
      },
    });

    return jsonSuccess(assignment, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "projects:write");

    const project = await prisma.project.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
    });
    if (!project) return jsonError("Project not found", "NOT_FOUND", 404);

    if (!isOrgOwnerOrAdmin(user) && project.managerUserId !== user.userId) {
      return jsonError("Only Organization Admins or the Project Manager can revoke assignments", "FORBIDDEN", 403);
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return jsonError("Missing userId to revoke assignment", "BAD_REQUEST", 400);
    }

    const assignment = await prisma.projectAssignment.findUnique({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId,
        },
      },
      include: { user: true },
    });

    if (!assignment) {
      return jsonError("Assignment not found", "NOT_FOUND", 404);
    }

    // Set status to REVOKED to preserve historical records
    await prisma.projectAssignment.update({
      where: { id: assignment.id },
      data: { status: "REVOKED" },
    });

    // Audit log
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PROJECT_ASSIGNMENT_REVOKED",
        entityType: "PROJECT_ASSIGNMENT",
        entityId: assignment.id,
        beforeJson: JSON.stringify({ status: "ACTIVE" }),
        afterJson: JSON.stringify({ status: "REVOKED" }),
        reason: `Revoked ${assignment.user.name}'s assignment from project ${project.name}`,
      },
    });

    return jsonSuccess({ message: "Project assignment revoked successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
