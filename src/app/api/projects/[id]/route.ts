import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireUserContext,
  requireProjectAccess,
  requirePermission,
  canReadFinance,
  isOrgOwnerOrAdmin,
} from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    await requireProjectAccess(user, params.id);

    const hasFinanceAccess = canReadFinance(user);

    const project = await prisma.project.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
        isArchived: false,
      },
      include: {
        site: true,
        manager: {
          select: { id: true, name: true, email: true },
        },
        assignments: {
          where: { status: "ACTIVE" },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        tasks: {
          where: { isArchived: false },
          include: {
            assignee: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        dailyReports: {
          include: {
            creator: { select: { id: true, name: true, role: true } },
          },
          orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
        },
        stockMovements: {
          where: { movementType: "ISSUE", isArchived: false },
          include: {
            material: true,
            store: true,
          },
          orderBy: { movementAt: "desc" },
          take: 20,
        },
        bills: hasFinanceAccess
          ? {
              where: { status: "POSTED", isArchived: false },
              include: {
                party: true,
                allocations: { where: { reversedAt: null } },
              },
            }
          : false,
      },
    });

    if (!project) {
      return jsonError("Project not found", "NOT_FOUND", 404);
    }

    let financials: any = undefined;
    if (hasFinanceAccess && project.bills) {
      const totalBilled = project.bills.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
      const totalPaid = project.bills.reduce((sum: number, b: any) => {
        const billPaid = b.allocations.reduce((pSum: number, a: any) => pSum + (a.amount || 0), 0);
        return sum + billPaid;
      }, 0);

      financials = {
        budgetAmount: project.budgetAmount,
        totalBilled,
        totalPaid,
        outstandingAmount: totalBilled - totalPaid,
      };
    }

    const sanitizedProject: any = { ...project };
    if (!hasFinanceAccess) {
      delete sanitizedProject.budgetAmount;
      delete sanitizedProject.bills;
    }

    return jsonSuccess({
      ...sanitizedProject,
      financials,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    await requireProjectAccess(user, params.id, "projects:write");

    const project = await prisma.project.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
    });
    if (!project) return jsonError("Project not found", "NOT_FOUND", 404);

    const body = await req.json();
    const { name, budgetAmount, status, managerUserId, notes, reason } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (budgetAmount !== undefined) {
      // Modifying budget requires finance:write permission
      if (!canReadFinance(user)) {
        return jsonError("Forbidden: Modifying budget requires financial permissions", "FORBIDDEN", 403);
      }
      updateData.budgetAmount = Number(budgetAmount);
    }
    if (status !== undefined) updateData.status = status;
    if (managerUserId !== undefined) updateData.managerUserId = managerUserId || null;
    if (notes !== undefined) updateData.notes = notes;

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: updateData,
      include: {
        site: true,
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PROJECT_UPDATED",
        entityType: "PROJECT",
        entityId: project.id,
        reason: reason || "Project details updated",
        beforeJson: JSON.stringify({
          name: project.name,
          budgetAmount: project.budgetAmount,
          status: project.status,
          managerUserId: project.managerUserId,
          notes: project.notes,
        }),
        afterJson: JSON.stringify({
          name: updated.name,
          budgetAmount: updated.budgetAmount,
          status: updated.status,
          managerUserId: updated.managerUserId,
          notes: updated.notes,
        }),
      },
    });

    return jsonSuccess(updated);
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
      where: {
        id: params.id,
        organizationId: user.organizationId,
        isArchived: false,
      },
    });

    if (!project) {
      return jsonError("Project not found", "NOT_FOUND", 404);
    }

    // Soft-delete / Archival to preserve historical data
    const archived = await prisma.project.update({
      where: { id: project.id },
      data: {
        isArchived: true,
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedById: user.userId,
        archiveReason: "Project archived by authorized user",
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PROJECT_ARCHIVED",
        entityType: "PROJECT",
        entityId: project.id,
        beforeJson: JSON.stringify({ name: project.name, code: project.code, status: project.status }),
        afterJson: JSON.stringify({ isArchived: true, status: "ARCHIVED" }),
        reason: "Project archived and preserved in audit records",
      },
    });

    return jsonSuccess({ archived: true, id: project.id });
  } catch (error) {
    return handleApiError(error);
  }
}
