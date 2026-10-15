import { prisma } from "@/lib/db";
import { roundPaise } from "@/lib/financial-math";
import { dynamicStore } from "@/lib/dynamic-store";

export class DashboardService {
  static async getKpiMetrics(organizationId: string, siteId?: string) {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
    const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);
    const now = new Date();

    // 1. Active Projects Count
    const activeProjectsWhere: any = {
      organizationId,
      status: { in: ["PLANNING", "IN_PROGRESS"] },
    };
    if (siteId) activeProjectsWhere.siteId = siteId;
    const activeProjectsCount = await prisma.project.count({
      where: activeProjectsWhere,
    });

    // 2. Tasks Due Today
    const tasksDueTodayWhere: any = {
      organizationId,
      dueAt: { gte: startOfToday, lte: endOfToday },
      status: { not: "COMPLETED" },
    };
    if (siteId) tasksDueTodayWhere.project = { siteId };
    const tasksDueTodayCount = await prisma.task.count({
      where: tasksDueTodayWhere,
    });

    // 3. Tasks Overdue
    const tasksOverdueWhere: any = {
      organizationId,
      dueAt: { lt: now },
      status: { not: "COMPLETED" },
    };
    if (siteId) tasksOverdueWhere.project = { siteId };
    const tasksOverdueCount = await prisma.task.count({
      where: tasksOverdueWhere,
    });

    // 4. Workers Present Today
    const attendanceWhere: any = {
      organizationId,
      workDate: todayStr,
      status: { in: ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"] },
    };
    if (siteId) attendanceWhere.siteId = siteId;
    const workersPresentTodayCount = await prisma.attendanceSession.count({
      where: attendanceWhere,
    });

    // 5. Low Stock Items Count
    const materials = await prisma.material.findMany({
      where: { organizationId, active: true },
      include: {
        stockBalances: siteId ? { where: { store: { siteId } } } : true,
      },
    });

    let lowStockItemsCount = 0;
    for (const mat of materials) {
      const totalStock = mat.stockBalances.reduce(
        (sum, b) => sum + b.quantityOnHand,
        0
      );
      if (mat.minStockQty > 0 && totalStock <= mat.minStockQty) {
        lowStockItemsCount++;
      }
    }

    // 6. Payments Made Today
    const paymentsToday = await prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: { gte: startOfToday, lte: endOfToday },
        status: "POSTED",
      },
    });
    const paymentsMadeTodayAmount = roundPaise(
      paymentsToday.reduce((sum, p) => sum + p.amount, 0)
    );

    // 7. Total Outstanding Payables
    const postedBills = await prisma.bill.findMany({
      where: { organizationId, status: "POSTED" },
      include: {
        allocations: {
          where: { reversedAt: null },
        },
      },
    });

    let totalOutstandingPayablesAmount = 0;
    for (const b of postedBills) {
      const paid = roundPaise(b.allocations.reduce((sum, a) => sum + a.amount, 0));
      const remaining = roundPaise(b.totalAmount - paid);
      if (remaining > 0) {
        totalOutstandingPayablesAmount = roundPaise(totalOutstandingPayablesAmount + remaining);
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
      };
    } catch (err) {
      console.warn("[DASHBOARD] Database unavailable, computing dynamic metrics from dynamicStore:", err);
      return dynamicStore.getKpiMetrics(siteId);
    }
  }
}
