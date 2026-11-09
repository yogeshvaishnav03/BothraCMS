import { prisma } from "@/lib/db";
import { bankAmount } from "@/lib/contractor-tds";
import { roundPaise } from "@/lib/financial-math";
import { UserContext } from "@/lib/auth";
import { canReadFinance, getUserAccessibleProjectIds } from "@/lib/server-auth";
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

    // 1. Active Projects filter
    const activeProjectsWhere: any = {
      organizationId,
      status: { in: ["PLANNING", "IN_PROGRESS", "ACTIVE"] },
      isArchived: false,
    };
    if (siteId) activeProjectsWhere.siteId = siteId;
    if (accessibleProjectIds !== null) {
      activeProjectsWhere.id = { in: accessibleProjectIds };
    }

    // 2. Tasks Due Today filter
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

    // 3. Tasks Overdue filter
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

    // 4. Attendance filter
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

    // Execute all independent metric queries in ONE parallel round-trip
    const [
      activeProjectsCount,
      activeProjectsList,
      tasksDueTodayCount,
      tasksDueTodayList,
      tasksOverdueCount,
      tasksOverdueList,
      allRecentRecords,
      staffAttendanceCount,
      attendanceList,
      stockSummaries,
      paymentsToday,
      postedBills,
    ] = await Promise.all([
      prisma.project.count({ where: activeProjectsWhere }),
      prisma.project.findMany({
        where: activeProjectsWhere,
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          budgetAmount: true,
          site: { select: { name: true, code: true } },
          manager: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.task.count({ where: tasksDueTodayWhere }),
      prisma.task.findMany({
        where: tasksDueTodayWhere,
        select: {
          id: true,
          title: true,
          priority: true,
          dueAt: true,
          project: { select: { name: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
      prisma.task.count({ where: tasksOverdueWhere }),
      prisma.task.findMany({
        where: tasksOverdueWhere,
        select: {
          id: true,
          title: true,
          priority: true,
          dueAt: true,
          project: { select: { name: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
      WorkforceHeadcountService.listRecords(organizationId, { siteId }).catch(() => []),
      prisma.attendanceSession.count({ where: attendanceWhere }).catch(() => 0),
      prisma.attendanceSession
        .findMany({
          where: attendanceWhere,
          select: {
            id: true,
            checkInAt: true,
            status: true,
            workforceMember: { select: { name: true, workerType: true } },
            creator: { select: { name: true, role: true } },
            site: { select: { name: true } },
          },
          orderBy: { checkInAt: "desc" },
          take: 15,
        })
        .catch(() => []),
      InventoryService.getAuthoritativeStockSummary(organizationId, siteId),
      hasFinanceAccess
        ? prisma.payment.findMany({
            where: {
              organizationId,
              paymentDate: { gte: startOfToday, lte: endOfToday },
              status: "POSTED",
              isArchived: false,
            },
            select: {
              id: true,
              recipientName: true,
              amount: true,
              tdsAmount: true,
              method: true,
              referenceNumber: true,
              payingAccount: true,
              paymentDate: true,
              party: { select: { name: true } },
            },
            orderBy: { paymentDate: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
      hasFinanceAccess
        ? prisma.bill.findMany({
            where: { organizationId, status: "POSTED", isArchived: false },
            select: {
              id: true,
              billNumber: true,
              totalAmount: true,
              dueDate: true,
              party: { select: { name: true } },
              allocations: {
                where: { reversedAt: null, payment: { status: "POSTED" } },
                select: { amount: true },
              },
            },
            orderBy: { dueDate: "asc" },
          })
        : Promise.resolve([]),
    ]);

    // Authoritative per-site workforce resolution from single headcount query:
    // For each site, prefer today's record; if none submitted today, fallback to the site's most recent record.
    const todayRecords = allRecentRecords.filter((r) => r.date === todayStr);
    const todaySummaryGrandTotal = todayRecords.reduce(
      (s, r) => s + (r.artisanCount ?? r.artisanTotal ?? 0) + (r.craftsmanCount ?? r.craftsmanTotal ?? 0) + (r.laborerTotal || 0),
      0
    );

    const siteRecordsMap = new Map<string, any>();
    for (const r of todayRecords) {
      if (!siteRecordsMap.has(r.siteId)) {
        siteRecordsMap.set(r.siteId, r);
      }
    }
    for (const r of allRecentRecords) {
      if (!siteRecordsMap.has(r.siteId)) {
        siteRecordsMap.set(r.siteId, r);
      }
    }

    const effectiveRecords = Array.from(siteRecordsMap.values());
    const hasTodayData = todayRecords.length > 0 && effectiveRecords.every((r) => r.date === todayStr);
    const isLatestFallback = effectiveRecords.some((r) => r.date !== todayStr);
    const latestDate = allRecentRecords.length > 0 ? allRecentRecords[0].date : todayStr;
    const activeDate = hasTodayData ? todayStr : effectiveRecords[0]?.date || latestDate;

    const effectiveArtisans = effectiveRecords.reduce((s, r) => s + (r.artisanCount ?? r.artisanTotal ?? 0), 0);
    const effectiveCraftsmen = effectiveRecords.reduce((s, r) => s + (r.craftsmanCount ?? r.craftsmanTotal ?? 0), 0);
    const effectiveLaborers = effectiveRecords.reduce((s, r) => s + (r.laborerTotal || 0), 0);
    const effectiveLaborerMale = effectiveRecords.reduce((s, r) => s + (r.laborerMale || 0), 0);
    const effectiveLaborerFemale = effectiveRecords.reduce((s, r) => s + (r.laborerFemale || 0), 0);
    const effectiveGrandTotal = effectiveArtisans + effectiveCraftsmen + effectiveLaborers;

    const workforceCount = effectiveGrandTotal;
    const totalWorkersPresentCount = workforceCount > 0 ? workforceCount : staffAttendanceCount;

    // Authoritative Low Stock Items
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

    // Financial Metrics (only exposed when user has finance:read permission)
    let paymentsMadeTodayAmount: number | undefined = undefined;
    let totalOutstandingPayablesAmount: number | undefined = undefined;
    let paymentsTodayList: any[] | undefined = undefined;
    let outstandingBillsList: any[] | undefined = undefined;

    if (hasFinanceAccess) {
      paymentsMadeTodayAmount = roundPaise(
        paymentsToday.reduce((sum: number, p: any) => sum + bankAmount(p), 0)
      );
      paymentsTodayList = paymentsToday.map((p: any) => ({
        id: p.id,
        recipientName: p.recipientName || p.party?.name || "Payee",
        amount: p.amount,
        method: p.method,
        referenceNumber: p.referenceNumber,
        payingAccount: p.payingAccount,
        paymentDate: p.paymentDate.toISOString(),
      }));

      let outstandingSum = 0;
      const billsList: any[] = [];
      for (const b of postedBills as any[]) {
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
        grandTotal: effectiveGrandTotal,
        totalArtisan: effectiveArtisans,
        totalCraftsman: effectiveCraftsmen,
        totalLaborer: effectiveLaborers,
        totalLaborerMale: effectiveLaborerMale,
        totalLaborerFemale: effectiveLaborerFemale,
        isLatestFallback,
        activeDate,
        todayGrandTotal: todaySummaryGrandTotal,
        records: (effectiveRecords || []).map((r) => ({
          id: r.id,
          siteId: r.siteId,
          siteName: r.siteName,
          date: r.date,
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
        allRecentRecords: (allRecentRecords || []).slice(0, 15).map((r) => ({
          id: r.id,
          siteId: r.siteId,
          siteName: r.siteName,
          date: r.date,
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
