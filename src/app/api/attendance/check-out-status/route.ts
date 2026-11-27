import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");

    // 1. Pending Tasks assigned to the user or on site
    const myTasks = await prisma.task.findMany({
      where: {
        organizationId: user.organizationId,
        isArchived: false,
        status: { notIn: ["COMPLETED", "VERIFIED", "ARCHIVED"] },
        assigneeUserId: user.userId,
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ priority: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 10,
    });

    // If no direct personal tasks, check if there are open critical/daily tasks on site
    let siteTasks: any[] = [];
    if (myTasks.length === 0) {
      const siteWhere: any = {
        organizationId: user.organizationId,
        isArchived: false,
        status: { notIn: ["COMPLETED", "VERIFIED", "ARCHIVED"] },
        priority: { in: ["CRITICAL", "HIGH", "DAILY"] },
      };
      if (siteId) {
        siteWhere.project = { siteId };
      }
      siteTasks = await prisma.task.findMany({
        where: siteWhere,
        include: {
          project: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 5,
      });
    }

    const pendingTasksList = myTasks.length > 0 ? myTasks : siteTasks;
    const isDirectlyAssigned = myTasks.length > 0;

    // 2. Pending Payments / Unapproved Payments
    const pendingApprovalPayments = await prisma.payment.findMany({
      where: {
        organizationId: user.organizationId,
        isArchived: false,
        status: "PENDING_APPROVAL",
      },
      include: {
        party: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // 3. Unpaid or Partially Paid Bills / Delivery Challans
    const billsWhere: any = {
      organizationId: user.organizationId,
      isArchived: false,
      status: { in: ["POSTED", "CHALLAN"] },
    };
    if (siteId) {
      billsWhere.project = { siteId };
    }

    const bills = await prisma.bill.findMany({
      where: billsWhere,
      include: {
        party: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        allocations: { where: { reversedAt: null } },
      },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      take: 20,
    });

    const unpaidBills = bills
      .map((b) => {
        const paid = b.allocations.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
        const outstanding = Math.max(0, b.totalAmount - paid);
        return {
          id: b.id,
          billNumber: b.billNumber,
          partyName: b.party?.name || "Unknown Party",
          projectName: b.project?.name || null,
          totalAmount: b.totalAmount,
          paidAmount: paid,
          outstandingAmount: outstanding,
          isFullyPaid: outstanding <= 0,
          status: b.status,
          billDate: b.billDate,
        };
      })
      .filter((b) => !b.isFullyPaid)
      .slice(0, 5);

    const pendingPaymentsList = [
      ...pendingApprovalPayments.map((p) => ({
        id: p.id,
        type: "PAYMENT_APPROVAL",
        reference: p.referenceNumber || "Payment Voucher",
        partyName: p.party?.name || p.recipientName || "Vendor / Contractor",
        projectName: p.project?.name || null,
        amount: p.amount,
        statusLabel: "Pending Approval",
      })),
      ...unpaidBills.map((b) => ({
        id: b.id,
        type: "UNPAID_BILL",
        reference: b.billNumber,
        partyName: b.partyName,
        projectName: b.projectName,
        amount: b.outstandingAmount,
        totalAmount: b.totalAmount,
        statusLabel: b.status === "CHALLAN" ? "Delivery Challan (Pending)" : "Unpaid / Pending Balance",
      })),
    ];

    const hasPendingTasks = pendingTasksList.length > 0;
    const hasPendingPayments = pendingPaymentsList.length > 0;
    const hasPendingItems = hasPendingTasks || hasPendingPayments;

    return jsonSuccess({
      hasPendingTasks,
      isDirectlyAssigned,
      pendingTasksCount: pendingTasksList.length,
      pendingTasks: pendingTasksList.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        projectName: t.project?.name || "General Site Operations",
        dueAt: t.dueAt,
      })),
      hasPendingPayments,
      pendingPaymentsCount: pendingPaymentsList.length,
      pendingPayments: pendingPaymentsList,
      hasPendingItems,
      userName: user.name || user.email,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
