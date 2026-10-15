import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

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

    if (!project) {
      return jsonError("Project not found or outside organization scope", "NOT_FOUND", 404);
    }

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
  } catch (error) {
    return handleApiError(error);
  }
}
