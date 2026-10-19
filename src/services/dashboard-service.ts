import { prisma } from "@/lib/db";
import { roundPaise } from "@/lib/financial-math";
import { UserContext } from "@/lib/auth";
import { canReadFinance, isOrgOwnerOrAdmin, getUserAccessibleProjectIds } from "@/lib/server-auth";
import { InventoryService } from "@/services/inventory-service";
import { WorkforceHeadcountService } from "@/services/workforce-headcount-service";

export class DashboardService {
  static async getKpiMetrics(organizationId: string, siteId?: string, userContext?: UserContext) {
    const todayStr = new Date().toISOString().split("T")[0];
    const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);
    const now = new Date();

    const hasFinanceAccess = userContext ? canReadFinance(userContext) : true;
    const accessibleProjectIds = userContext ? await getUserAccessibleProjectIds(userContext) : null;

    // 1. Active Projects Count & List
    const activeProjectsWhere: any = {
      organizationId,
      status: { in: ["PLANNING", "IN_PROGRESS", "ACTIVE"] },
      isArchived: false,
    };
    if (siteId) activeProjectsWhere.siteId = siteId;
    if (accessibleProjectIds !== null) {
      activeProjectsWhere.id = { in: accessibleProjectIds };
    }

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
      status: { notIn: ["COMPLETED", "VERIFIED", "ARCHIVED"] },
      isArchived: false,
    };
    if (siteId) tasksDueTodayWhere.project = { siteId };
    if (accessibleProjectIds !== null) {
      tasksDueTodayWhere.projectId = { in: accessibleProjectIds };
    }

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
      status: { notIn: ["COMPLETED", "VERIFIED", "ARCHIVED"] },
      isArchived: false,
    };
    if (siteId) tasksOverdueWhere.project = { siteId };
    if (accessibleProjectIds !== null) {
      tasksOverdueWhere.projectId = { in: accessibleProjectIds };
    }

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

    // 4. Site Workforce Headcount & Checked-in Attendance on Site Today
    const [headcountSummary, headcountRecords] = await Promise.all([
      WorkforceHeadcountService.getSummary(organizationId, siteId, todayStr).catch(() => ({
        totalArtisan: 0,
        totalCraftsman: 0,
        totalLaborer: 0,
        totalLaborerMale: 0,
        totalLaborerFemale: 0,
        grandTotal: 0,
      })),
      WorkforceHeadcountService.listRecords(organizationId, { siteId, date: todayStr }).catch(() => []),
    ]);

    const attendanceWhere: any = {
      organizationId,
      workDate: todayStr,
      status: { in: ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"] },
      isArchived: false,
    };
    if (siteId) attendanceWhere.siteId = siteId;
    if (accessibleProjectIds !== null) {
      attendanceWhere.OR = [
        { projectId: { in: accessibleProjectIds } },
        { projectId: null },
      ];
    }

    const [staffAttendanceCount, attendanceList] = await Promise.all([
      prisma.attendanceSession.count({ where: attendanceWhere }).catch(() => 0),
      prisma.attendanceSession.findMany({
        where: attendanceWhere,
        include: {
          workforceMember: { select: { name: true, workerType: true } },
          creator: { select: { name: true, role: true } },
          site: { select: { name: true } },
        },
        orderBy: { checkInAt: "desc" },
        take: 15,
      }).catch(() => []),
    ]);

    const workforceCount = headcountSummary.grandTotal;
    const totalWorkersPresentCount = workforceCount > 0 ? workforceCount : staffAttendanceCount;

    // 5. Authoritative Low Stock Items from Inventory Ledger
    const stockSummaries = await InventoryService.getAuthoritativeStockSummary(organizationId, siteId);
    const lowStockItems = stockSummaries.filter((m) => m.isLowStock);
    const lowStockItemsCount = lowStockItems.length;
    const lowStockItemsList = lowStockItems.slice(0, 10).map((mat) => ({
      id: mat.id,
      name: mat.name,
      code: mat.code,
      category: mat.categoryName,
      quantityOnHand: mat.availableStock,
      actualStock: mat.availableStock,
      minStockQty: mat.minStockQty,
      reorderQty: mat.reorderQty,
      unitCode: mat.unitCode,
      alertReason: mat.alertReason,
      alertSeverity: mat.alertSeverity,
    }));

    // 6. Financial Metrics (only calculated and exposed if user has finance:read permission)
    let paymentsMadeTodayAmount: number | undefined = undefined;
    let totalOutstandingPayablesAmount: number | undefined = undefined;
    let paymentsTodayList: any[] | undefined = undefined;
    let outstandingBillsList: any[] | undefined = undefined;

    if (hasFinanceAccess) {
      const paymentsToday = await prisma.payment.findMany({
        where: {
          organizationId,
          paymentDate: { gte: startOfToday, lte: endOfToday },
          status: "POSTED",
          isArchived: false,
        },
        include: {
          party: { select: { name: true } },
        },
        orderBy: { paymentDate: "desc" },
        take: 10,
      });

      paymentsMadeTodayAmount = roundPaise(
        paymentsToday.reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0)
      );
      paymentsTodayList = paymentsToday.map((p) => ({
        id: p.id,
        recipientName: p.recipientName || p.party?.name || "Payee",
        amount: p.amount,
        method: p.method,
        referenceNumber: p.referenceNumber,
        payingAccount: p.payingAccount,
        paymentDate: p.paymentDate.toISOString(),
      }));

      const postedBills = await prisma.bill.findMany({
        where: { organizationId, status: "POSTED", isArchived: false },
        include: {
          party: { select: { name: true } },
          allocations: {
            where: { reversedAt: null, payment: { status: "POSTED" } },
          },
        },
        orderBy: { dueDate: "asc" },
      });

      let outstandingSum = 0;
      const billsList: any[] = [];
      for (const b of postedBills) {
        const paid = roundPaise(b.allocations.reduce((sum: number, a: any) => sum + (a.amount ?? 0), 0));
        const remaining = roundPaise(b.totalAmount - paid);
        if (remaining > 0) {
          outstandingSum = roundPaise(outstandingSum + remaining);
          if (billsList.length < 10) {
            billsList.push({
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
      totalOutstandingPayablesAmount = outstandingSum;
      outstandingBillsList = billsList;
    }

    return {
      activeProjectsCount,
      tasksDueTodayCount,
      tasksOverdueCount,
      workersPresentTodayCount: totalWorkersPresentCount,
      workforceCount,
      staffAttendanceCount,
      totalOnSiteCount: workforceCount + staffAttendanceCount,
      workforceHeadcount: {
        grandTotal: headcountSummary.grandTotal,
        totalArtisan: headcountSummary.totalArtisan,
        totalCraftsman: headcountSummary.totalCraftsman,
        totalLaborer: headcountSummary.totalLaborer,
        totalLaborerMale: headcountSummary.totalLaborerMale,
        totalLaborerFemale: headcountSummary.totalLaborerFemale,
        records: (headcountRecords || []).map((r) => ({
          id: r.id,
          siteId: r.siteId,
          siteName: r.siteName,
          shift: r.shift,
          artisanCount: r.artisanCount ?? r.artisanTotal ?? 0,
          craftsmanCount: r.craftsmanCount ?? r.craftsmanTotal ?? 0,
          laborerMale: r.laborerMale,
          laborerFemale: r.laborerFemale,
          laborerTotal: r.laborerTotal,
          grandTotal: r.grandTotal,
          contractorName: r.contractorName,
          notes: r.notes,
          supervisorName: r.supervisorName,
          createdAt: r.createdAt,
        })),
      },
      lowStockItemsCount,
      paymentsMadeTodayAmount,
      totalOutstandingPayablesAmount,
      activeProjects: activeProjectsList.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        budgetAmount: hasFinanceAccess ? p.budgetAmount : undefined,
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
        workerName: a.creator?.name || a.workforceMember?.name || "Staff Member",
        trade: a.creator?.role || a.workforceMember?.workerType || "Staff",
        siteName: a.site?.name,
        checkInAt: a.checkInAt ? a.checkInAt.toISOString() : null,
        status: a.status,
      })),
      lowStockItems: lowStockItemsList,
      paymentsMadeToday: paymentsTodayList,
      outstandingPayables: outstandingBillsList,
    };
  }
}
