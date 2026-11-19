import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  requireUserContext,
  requireProjectAccess,
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
              where: { isArchived: false },
              include: {
                party: true,
                allocations: {
                  where: { reversedAt: null },
                  include: {
                    payment: {
                      select: {
                        id: true,
                        referenceNumber: true,
                        paymentDate: true,
                        status: true,
                        amount: true,
                        method: true,
                      },
                    },
                  },
                },
              },
              orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
            }
          : false,
        drawings: {
          include: {
            revisions: { orderBy: { createdAt: "desc" } },
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!project) {
      return jsonError("Project not found", "NOT_FOUND", 404);
    }

    let financials: any = undefined;
    let payments: any[] = [];
    if (hasFinanceAccess) {
      const bills = project.bills || [];
      const totalBilled = bills.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
      const totalPaid = bills.reduce((sum: number, b: any) => {
        const billPaid = (b.allocations || []).reduce((pSum: number, a: any) => pSum + (a.amount || 0), 0);
        return sum + billPaid;
      }, 0);

      financials = {
        budgetAmount: project.budgetAmount,
        totalBilled,
        totalPaid,
        outstandingAmount: Math.max(0, totalBilled - totalPaid),
      };

      payments = await prisma.payment.findMany({
        where: {
          organizationId: user.organizationId,
          isArchived: false,
          OR: [
            { projectId: params.id },
            { allocations: { some: { bill: { projectId: params.id } } } },
          ],
        },
        include: {
          party: true,
          creator: { select: { id: true, name: true, role: true } },
          allocations: {
            where: { reversedAt: null },
            include: {
              bill: { select: { id: true, billNumber: true, totalAmount: true } },
            },
          },
        },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      });
    }

    const headcounts = await prisma.workforceHeadcount.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [
          { projectId: params.id },
          ...(project.siteId ? [{ siteId: project.siteId }] : []),
        ],
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    const sanitizedProject: any = { ...project };
    if (!hasFinanceAccess) {
      delete sanitizedProject.budgetAmount;
      delete sanitizedProject.bills;
    }

    return jsonSuccess({
      ...sanitizedProject,
      financials,
      payments: hasFinanceAccess ? payments : [],
      headcounts,
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
      if (!hasPermission(user, "finance:write")) {
        return jsonError("Forbidden: Modifying budget requires financial write permissions", "FORBIDDEN", 403);
      }
      updateData.budgetAmount = Number(budgetAmount);
    }
    if (status !== undefined) updateData.status = status;
    if (managerUserId !== undefined) {
      if (managerUserId) {
        const manager = await prisma.user.findFirst({
          where: { id: String(managerUserId), organizationId: user.organizationId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!manager) {
          return jsonError("Assigned manager not found in this organization", "NOT_FOUND", 404);
        }
        updateData.managerUserId = manager.id;
      } else {
        updateData.managerUserId = null;
      }
    }
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
    await requireProjectAccess(user, params.id, "projects:write");

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
