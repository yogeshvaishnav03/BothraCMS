import { prisma } from "@/lib/db";
import { roundPaise } from "@/lib/financial-math";

export class DashboardService {
  static async getKpiMetrics(organizationId: string, siteId?: string) {
    const todayStr = new Date().toISOString().split("T")[0];
    const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);
    const now = new Date();

    // 1. Active Projects Count & List
    const activeProjectsWhere: any = {
      organizationId,
      status: { in: ["PLANNING", "IN_PROGRESS", "ACTIVE"] },
    };
    if (siteId) activeProjectsWhere.siteId = siteId;
    const [activeProjectsCount, activeProjectsList] = await Promise.all([
      prisma.project.count({ where: activeProjectsWhere }),
      prisma.project.findMany({
        where: activeProjectsWhere,
        include: {
          site: { select: { name: true, code: true } },
          manager: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);

    // 2. Tasks Due Today
    const tasksDueTodayWhere: any = {
      organizationId,
      dueAt: { gte: startOfToday, lte: endOfToday },
      status: { not: "COMPLETED" },
    };
    if (siteId) tasksDueTodayWhere.project = { siteId };
    const [tasksDueTodayCount, tasksDueTodayList] = await Promise.all([
      prisma.task.count({ where: tasksDueTodayWhere }),
      prisma.task.findMany({
        where: tasksDueTodayWhere,
        include: {
          project: { select: { name: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
    ]);

    // 3. Tasks Overdue
    const tasksOverdueWhere: any = {
      organizationId,
      dueAt: { lt: now },
      status: { not: "COMPLETED" },
    };
    if (siteId) tasksOverdueWhere.project = { siteId };
    const [tasksOverdueCount, tasksOverdueList] = await Promise.all([
      prisma.task.count({ where: tasksOverdueWhere }),
      prisma.task.findMany({
        where: tasksOverdueWhere,
        include: {
          project: { select: { name: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
    ]);

    // 4. Workers Present Today
    const attendanceWhere: any = {
      organizationId,
      workDate: todayStr,
      status: { in: ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"] },
    };
    if (siteId) attendanceWhere.siteId = siteId;
    const [workersPresentTodayCount, attendanceList] = await Promise.all([
      prisma.attendanceSession.count({ where: attendanceWhere }),
      prisma.attendanceSession.findMany({
        where: attendanceWhere,
        include: {
          workforceMember: { select: { name: true, workerType: true } },
          site: { select: { name: true } },
        },
        orderBy: { checkInAt: "desc" },
        take: 10,
      }),
    ]);

    // 5. Low Stock Items Count
    const materials = await prisma.material.findMany({
      where: { organizationId, active: true },
      include: {
        category: { select: { name: true } },
        stockBalances: siteId ? { where: { store: { siteId } } } : true,
      },
    });

    let lowStockItemsCount = 0;
    const lowStockItemsList: any[] = [];
    for (const mat of materials) {
      const totalStock = mat.stockBalances.reduce(
        (sum: number, b: any) => sum + (b.quantityOnHand ?? 0),
        0
      );
      if (mat.minStockQty > 0 && totalStock <= mat.minStockQty) {
        lowStockItemsCount++;
        if (lowStockItemsList.length < 10) {
          lowStockItemsList.push({
            id: mat.id,
            name: mat.name,
            code: mat.sku,
            category: mat.category?.name || "General",
            quantityOnHand: totalStock,
            minStockQty: mat.minStockQty,
            unitCode: mat.unitCode,
          });
        }
      }
    }

    // 6. Payments Made Today
    const paymentsToday = await prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: { gte: startOfToday, lte: endOfToday },
        status: "POSTED",
      },
      include: {
        party: { select: { name: true } },
      },
      orderBy: { paymentDate: "desc" },
      take: 10,
    });
    const paymentsMadeTodayAmount = roundPaise(
      paymentsToday.reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0)
    );

    // 7. Total Outstanding Payables
    const postedBills = await prisma.bill.findMany({
      where: { organizationId, status: "POSTED" },
      include: {
        party: { select: { name: true } },
        allocations: {
          where: { reversedAt: null, payment: { status: "POSTED" } },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    let totalOutstandingPayablesAmount = 0;
    const outstandingBillsList: any[] = [];
    for (const b of postedBills) {
      const paid = roundPaise(b.allocations.reduce((sum: number, a: any) => sum + (a.amount ?? 0), 0));
      const remaining = roundPaise(b.totalAmount - paid);
      if (remaining > 0) {
        totalOutstandingPayablesAmount = roundPaise(totalOutstandingPayablesAmount + remaining);
        if (outstandingBillsList.length < 10) {
          outstandingBillsList.push({
            id: b.id,
            billNumber: b.billNumber,
            partyName: b.party?.name || "Vendor/Contractor",
            totalAmount: b.totalAmount,
            paidAmount: paid,
            remainingAmount: remaining,
            dueDate: b.dueDate ? b.dueDate.toISOString() : null,
          });
        }
      }
    }

    return {
      activeProjectsCount,
      tasksDueTodayCount,
      tasksOverdueCount,
      workersPresentTodayCount,
      lowStockItemsCount,
      paymentsMadeTodayAmount,
      totalOutstandingPayablesAmount,
      activeProjects: activeProjectsList.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        budgetAmount: p.budgetAmount,
        siteName: p.site?.name,
        managerName: p.manager?.name,
      })),
      tasksDueToday: tasksDueTodayList.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        projectName: t.project?.name,
        assigneeName: t.assignee?.name,
      })),
      tasksOverdue: tasksOverdueList.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        projectName: t.project?.name,
        assigneeName: t.assignee?.name,
      })),
      workersPresentToday: (attendanceList as any[]).map((a) => ({
        id: a.id,
        workerName: a.workforceMember?.name || "Worker",
        trade: a.workforceMember?.workerType || "General",
        siteName: a.site?.name,
        checkInAt: a.checkInAt ? a.checkInAt.toISOString() : null,
        status: a.status,
      })),
      lowStockItems: lowStockItemsList,
      paymentsMadeToday: paymentsToday.map((p) => ({
        id: p.id,
        recipientName: p.recipientName || p.party?.name || "Payee",
        amount: p.amount,
        method: p.method,
        referenceNumber: p.referenceNumber,
        payingAccount: p.payingAccount,
        paymentDate: p.paymentDate.toISOString(),
      })),
      outstandingPayables: outstandingBillsList,
    };
  }
}
