import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    try {
      const project = await prisma.project.findFirst({
        where: {
          id: params.id,
          organizationId: user.organizationId,
        },
        include: {
          site: true,
          manager: {
            select: { id: true, name: true, email: true },
          },
          tasks: {
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
            where: { movementType: "ISSUE" },
            include: {
              material: true,
              store: true,
            },
            orderBy: { movementAt: "desc" },
            take: 20,
          },
          bills: {
            where: { status: "POSTED" },
            include: {
              party: true,
              allocations: { where: { reversedAt: null } },
            },
          },
        },
      });

      if (project) {
        // Compute financial aggregates
        const totalBilled = project.bills.reduce((sum, b) => sum + b.totalAmount, 0);
        const totalPaid = project.bills.reduce((sum, b) => {
          const billPaid = b.allocations.reduce((pSum, a) => pSum + a.amount, 0);
          return sum + billPaid;
        }, 0);

        return jsonSuccess({
          ...project,
          financials: {
            budgetAmount: project.budgetAmount,
            totalBilled,
            totalPaid,
            outstandingAmount: totalBilled - totalPaid,
          },
        });
      }
    } catch (dbErr) {
      console.warn("[PROJECT] Database query failed, checking dynamicStore:", dbErr);
    }

    const fallbackProject = dynamicStore.getProject(params.id);
    if (!fallbackProject) {
      return jsonError("Project not found", "NOT_FOUND", 404);
    }

    return jsonSuccess(fallbackProject);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    try {
      await prisma.project.delete({
        where: { id: params.id },
      });
    } catch {
      dynamicStore.deleteProject(params.id);
    }
    return jsonSuccess({ deleted: true, id: params.id });
  } catch (error) {
    return handleApiError(error);
  }
}
