import { prisma } from "@/lib/db";
import { bankAmount } from "@/lib/contractor-tds";
import { WorkforceHeadcountService } from "@/services/workforce-headcount-service";

// Shared by GET /api/day-book and the admin Command Center.

function matchesDate(val: Date | string | null | undefined, targetDate: string): boolean {
  if (!val) return false;
  if (typeof val === "string" && val.startsWith(targetDate)) return true;
  const d = new Date(val);
  if (isNaN(d.getTime())) return false;
  // 1. Exact UTC date match
  if (d.toISOString().slice(0, 10) === targetDate) return true;
  // 2. IST (+05:30) date match
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return ist === targetDate;
}

function matchesDateRange(val: Date | string | null | undefined, fromDate: string, toDate: string): boolean {
  if (!val) return false;
  if (fromDate === toDate) return matchesDate(val, fromDate);
  if (typeof val === "string") {
    const s = val.slice(0, 10);
    if (s >= fromDate && s <= toDate) return true;
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return false;
  const utcDate = d.toISOString().slice(0, 10);
  if (utcDate >= fromDate && utcDate <= toDate) return true;
  const istDate = new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return istDate >= fromDate && istDate <= toDate;
}

const attachmentSelect = {
  id: true,
  fileId: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  category: true,
  entityId: true,
  createdAt: true,
} as const;

function groupAttachmentsByEntityId(rows: any[]) {
  const map = new Map<string, any[]>();
  for (const a of rows) {
    const item = { ...a, url: `/api/uploads/${a.fileId}` };
    const list = map.get(a.entityId);
    if (list) list.push(item);
    else map.set(a.entityId, [item]);
  }
  return map;
}

export async function fetchDayBookData(
  orgId: string,
  dateOrFrom: string,
  siteIdOrTo?: string,
  maybeSiteId?: string
) {
  let fromDate = dateOrFrom;
  let toDate = dateOrFrom;
  let siteId: string | undefined = undefined;

  if (siteIdOrTo && /^\d{4}-\d{2}-\d{2}$/.test(siteIdOrTo)) {
    toDate = siteIdOrTo;
    siteId = maybeSiteId;
  } else {
    siteId = siteIdOrTo;
  }
  if (fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  const startOfDay = new Date(`${fromDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${toDate}T23:59:59.999Z`);
  // Buffer for timezone differences (+/- 14 hours)
  const broadStart = new Date(startOfDay.getTime() - 14 * 3600 * 1000);
  const broadEnd = new Date(endOfDay.getTime() + 14 * 3600 * 1000);

  // 1. Payments filter
  const paymentWhere: any = {
    organizationId: orgId,
    status: { not: "REVERSED" },
    OR: [
      { paymentDate: { gte: broadStart, lte: broadEnd } },
      { createdAt: { gte: startOfDay, lte: endOfDay } },
    ],
  };
  if (siteId) {
    paymentWhere.project = { siteId };
  }

  // 2. Bills filter
  const billWhere: any = {
    organizationId: orgId,
    isArchived: false,
    OR: [
      { billDate: { gte: broadStart, lte: broadEnd } },
      { createdAt: { gte: startOfDay, lte: endOfDay } },
    ],
  };
  if (siteId) {
    billWhere.project = { siteId };
  }

  // 3. Stock movements filter
  const stockWhere: any = {
    organizationId: orgId,
    OR: [
      { createdAt: { gte: broadStart, lte: broadEnd } },
      { movementAt: { gte: broadStart, lte: broadEnd } },
    ],
  };
  if (siteId) {
    stockWhere.store = { siteId };
  }

  // 4. Workforce filters
  const attendanceWhere: any = {
    organizationId: orgId,
    workDate: fromDate === toDate ? fromDate : { gte: fromDate, lte: toDate },
    isArchived: false,
  };
  if (siteId) {
    attendanceWhere.siteId = siteId;
  }

  const staffAttendanceWhere: any = {
    organizationId: orgId,
    workDate: fromDate === toDate ? fromDate : { gte: fromDate, lte: toDate },
  };
  if (siteId) {
    staffAttendanceWhere.checkInSiteId = siteId;
  }

  // 5. Daily Site Reports filter
  const reportWhere: any = {
    organizationId: orgId,
    reportDate: fromDate === toDate ? fromDate : { gte: fromDate, lte: toDate },
  };
  if (siteId) {
    reportWhere.project = { siteId };
  }

  // Run all primary queries concurrently in ONE parallel round-trip (removing duplicate headcount query)
  const [
    rawPayments,
    rawBills,
    rawMovements,
    staffAttendanceRaw,
    attendanceSessionsRaw,
    allHeadcountRecords,
    orgSites,
    dailyReportsRaw,
    moneyIn,
  ] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere,
      include: {
        party: { select: { id: true, name: true, partyType: true } },
        project: { select: { id: true, name: true, code: true, siteId: true } },
        allocations: { include: { bill: { select: { id: true, billNumber: true, totalAmount: true } } } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.bill.findMany({
      where: billWhere,
      include: {
        party: { select: { id: true, name: true, partyType: true } },
        project: { select: { id: true, code: true, name: true, siteId: true } },
      },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.stockMovement.findMany({
      where: stockWhere,
      include: {
        material: { select: { id: true, sku: true, name: true, unitCode: true } },
        store: { select: { id: true, name: true, siteId: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.staffAttendance
      .findMany({
        where: staffAttendanceWhere,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              jobTitle: true,
              phone: true,
            },
          },
        },
        orderBy: { checkInAt: "desc" },
      })
      .catch(() => []),
    prisma.attendanceSession
      .findMany({
        where: attendanceWhere,
        include: {
          workforceMember: { select: { id: true, employeeCode: true, name: true, workerType: true } },
          site: { select: { id: true, name: true, code: true } },
          creator: { select: { id: true, name: true, role: true } },
        },
        orderBy: { checkInAt: "desc" },
      })
      .catch(() => []),
    WorkforceHeadcountService.listRecords(orgId, { siteId }).catch(() => []),
    prisma.site
      .findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, code: true },
      })
      .catch(() => []),
    prisma.dailySiteReport.findMany({
      where: reportWhere,
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            site: { select: { id: true, name: true, code: true } },
          },
        },
        creator: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesReceipt.findMany({
      where: {
        organizationId: orgId,
        date: fromDate === toDate ? fromDate : { gte: fromDate, lte: toDate },
        cancelledAt: null,
        booking: { status: "ACTIVE", ...(siteId ? { unit: { project: { siteId } } } : {}) },
      },
      include: {
        booking: { select: { id: true, bookingNumber: true, customerName: true, unit: { select: { unitNumber: true, project: { select: { id: true, name: true } } } } } },
        installment: { select: { label: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const filteredPayments = rawPayments.filter((p) => {
    return matchesDateRange(p.paymentDate, fromDate, toDate) || matchesDateRange(p.createdAt, fromDate, toDate);
  });

  const payments = filteredPayments.map((p) => ({
    ...p,
    paymentMethod: p.method,
  }));

  const bills = rawBills.filter((b) => {
    return matchesDateRange(b.billDate, fromDate, toDate) || matchesDateRange(b.createdAt, fromDate, toDate);
  });

  const movements = rawMovements.filter((m) => {
    return matchesDateRange(m.movementAt, fromDate, toDate) || matchesDateRange(m.createdAt, fromDate, toDate);
  });

  const receipts = movements.filter((m) => m.movementType === "RECEIPT");
  const issues = movements.filter((m) => m.movementType === "ISSUE");

  // Fetch attachments for reports, bills, and payments in ONE parallel round-trip
  const reportIds = dailyReportsRaw.map((r: any) => r.id);
  const billIds = bills.map((b: any) => b.id);
  const paymentIds = payments.map((p: any) => p.id);

  const [reportAttachments, billAttachments, paymentAttachments] = await Promise.all([
    reportIds.length > 0
      ? prisma.attachment.findMany({
          where: {
            organizationId: orgId,
            entityType: { in: ["DAILY_REPORT", "DAILY_SITE_REPORT"] },
            entityId: { in: reportIds },
            isArchived: false,
          },
          select: attachmentSelect,
        })
      : Promise.resolve([]),
    billIds.length > 0
      ? prisma.attachment.findMany({
          where: {
            organizationId: orgId,
            entityType: "BILL",
            entityId: { in: billIds },
            isArchived: false,
          },
          select: attachmentSelect,
        })
      : Promise.resolve([]),
    paymentIds.length > 0
      ? prisma.attachment.findMany({
          where: {
            organizationId: orgId,
            entityType: "PAYMENT",
            entityId: { in: paymentIds },
            isArchived: false,
          },
          select: attachmentSelect,
        })
      : Promise.resolve([]),
  ]);

  const reportAttMap = groupAttachmentsByEntityId(reportAttachments);
  const billAttMap = groupAttachmentsByEntityId(billAttachments);
  const paymentAttMap = groupAttachmentsByEntityId(paymentAttachments);

  const allRecentHeadcount = allHeadcountRecords;
  const siteMap = new Map(orgSites.map((s) => [s.id, s.name]));

  // Helper to cleanly format staff role for presentation
  const formatStaffRole = (role?: string | null): string => {
    if (!role) return "Staff";
    switch (role) {
      case "SUPER_ADMIN": return "Super Admin";
      case "ORG_ADMIN": return "Admin";
      case "PROJECT_MANAGER": return "Project Manager";
      case "SITE_SUPERVISOR": return "Site Supervisor";
      case "SITE_ENGINEER": return "Site Engineer";
      case "ACCOUNTANT": return "Site Accountant";
      case "STOREKEEPER": return "Storekeeper";
      case "HR_VIEWER": return "HR Manager";
      case "AUDITOR": return "Auditor";
      default: return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  // Trade worker / labour types that belong to Site Workers & Contractors (NOT Staff)
  const WORKER_TRADE_TYPES = new Set([
    "MASON",
    "CARPENTER",
    "HELPER",
    "ELECTRICIAN",
    "PLUMBER",
    "PAINTER",
    "WELDER",
    "BAR_BENDER",
    "LABOUR",
    "LABOR",
    "FITTER",
    "OPERATOR",
    "DRIVER",
    "BLACKSMITH",
    "STEEL_FIXER",
    "SCAFFOLDER",
    "SHUTTERING",
    "TILES_MASON",
    "FOREMAN",
  ]);

  // Separate Staff Attendance from Worker & Contractor Labour Attendance
  const staffRecords: any[] = [];
  const seenStaffIds = new Set<string>();

  // 4a. Add registered staff members from StaffAttendance
  for (const sa of staffAttendanceRaw) {
    if (!sa.user) continue;
    seenStaffIds.add(sa.userId);
    const roleLabel = sa.user.jobTitle || formatStaffRole(sa.user.role);
    const code = `USR-${sa.user.id.slice(-6).toUpperCase()}`;
    staffRecords.push({
      id: sa.id,
      userId: sa.userId,
      workDate: sa.workDate,
      employeeCode: code,
      name: sa.user.name || "Staff Member",
      email: sa.user.email,
      role: roleLabel,
      rawRole: sa.user.role,
      status: sa.status,
      checkInAt: sa.checkInAt ? sa.checkInAt.toISOString() : null,
      checkOutAt: sa.checkOutAt ? sa.checkOutAt.toISOString() : null,
      siteId: sa.checkInSiteId,
      siteName: sa.checkInSiteId ? siteMap.get(sa.checkInSiteId) || null : null,
      isStaff: true,
      workforceMember: {
        id: sa.userId,
        employeeCode: code,
        name: sa.user.name || "Staff Member",
        workerType: roleLabel,
      },
    });
  }

  // 4b. Separate AttendanceSessions: only include in staff if actually a staff designation/creator
  const workerRecords: any[] = [];

  for (const a of attendanceSessionsRaw) {
    const workerType = (a.workforceMember?.workerType || "").toUpperCase();
    const isWorkerTrade = WORKER_TRADE_TYPES.has(workerType);
    const isExplicitStaff =
      Boolean(a.workforceMember?.employeeCode?.startsWith("USR-")) ||
      Boolean(a.workforceMember?.employeeCode?.startsWith("STF-")) ||
      ["SITE_ENGINEER", "SITE_SUPERVISOR", "SUPERVISOR", "PROJECT_MANAGER", "STAFF", "OFFICE_STAFF", "ACCOUNTANT", "ADMIN", "HR_VIEWER", "AUDITOR"].includes(workerType);

    if (!isWorkerTrade && isExplicitStaff) {
      const creatorId = a.creator?.id;
      if (!creatorId || !seenStaffIds.has(creatorId)) {
        if (creatorId) seenStaffIds.add(creatorId);
        const roleLabel = a.workforceMember?.workerType
          ? formatStaffRole(a.workforceMember.workerType)
          : a.creator?.role
          ? formatStaffRole(a.creator.role)
          : "Staff";
        const code = a.workforceMember?.employeeCode || `USR-${a.id.slice(-6).toUpperCase()}`;
        staffRecords.push({
          id: a.id,
          userId: creatorId || a.id,
          workDate: a.workDate,
          employeeCode: code,
          name: a.workforceMember?.name || a.creator?.name || "Staff Member",
          email: null,
          role: roleLabel,
          rawRole: a.workforceMember?.workerType || a.creator?.role || "STAFF",
          status: a.status,
          checkInAt: a.checkInAt ? (typeof a.checkInAt === "string" ? a.checkInAt : a.checkInAt.toISOString()) : null,
          checkOutAt: a.checkOutAt ? (typeof a.checkOutAt === "string" ? a.checkOutAt : a.checkOutAt.toISOString()) : null,
          siteId: a.siteId,
          siteName: a.site?.name || null,
          isStaff: true,
          workforceMember: {
            id: a.workforceMember?.id || a.id,
            employeeCode: code,
            name: a.workforceMember?.name || a.creator?.name || "Staff Member",
            workerType: roleLabel,
          },
        });
      }
    } else {
      // Worker / Contractor Trade Labour
      workerRecords.push({
        ...a,
        isStaff: false,
      });
    }
  }

  const headcountRecords = allHeadcountRecords.filter((r) => r.date >= fromDate && r.date <= toDate);

  const dailyReports = dailyReportsRaw.map((r: any) => ({
    ...r,
    attachments: reportAttMap.get(r.id) || [],
  }));

  const enrichedBills = bills.map((b: any) => ({
    ...b,
    attachments: billAttMap.get(b.id) || [],
  }));

  const enrichedPayments = payments.map((p: any) => ({
    ...p,
    attachments: paymentAttMap.get(p.id) || [],
  }));

  // Summaries
  // Money that left the bank: TDS held back from a contractor stays until it is deposited.
  // Note: REJECTED payments are not disbursed from the bank, so they are tracked separately.
  const disbursedPayments = payments.filter((p: any) => p.status !== "REJECTED");
  const rejectedPayments = payments.filter((p: any) => p.status === "REJECTED");

  const totalPaymentsAmount = disbursedPayments.reduce((acc: number, p: any) => acc + bankAmount(p), 0);
  const totalRejectedPaymentsAmount = rejectedPayments.reduce((acc: number, p: any) => acc + bankAmount(p), 0);
  const totalBillsAmount = bills.reduce((acc: number, b: any) => acc + (b.totalAmount || 0), 0);

  const totalHeadcount = headcountRecords.reduce((s, r) => s + (r.grandTotal || 0), 0);
  const totalArtisans = headcountRecords.reduce((s, r) => s + (r.artisanCount ?? r.artisanTotal ?? 0), 0);
  const totalCraftsmen = headcountRecords.reduce((s, r) => s + (r.craftsmanCount ?? r.craftsmanTotal ?? 0), 0);
  const totalLaborers = headcountRecords.reduce((s, r) => s + (r.laborerTotal || 0), 0);

  const staffPresentCount = staffRecords.filter((a) =>
    ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)
  ).length;

  const totalWorkerSessions = workerRecords.filter((w) =>
    ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(w.status)
  ).length;

  const workersPresentCount = totalHeadcount > 0 ? totalHeadcount + totalWorkerSessions : totalWorkerSessions;

  const displayDate = fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;

  const recentActivityDates = Array.from(
    new Set(
      allRecentHeadcount
        .map((r) => r.date)
        .filter((d): d is string => Boolean(d) && d !== fromDate)
    )
  ).slice(0, 3);

  return {
    date: displayDate,
    fromDate,
    toDate,
    summary: {
      totalPaymentsAmount,
      totalRejectedPaymentsAmount,
      totalBillsAmount,
      totalMoneyInAmount: moneyIn.reduce((acc, r) => acc + r.amount, 0),
      moneyInCount: moneyIn.length,
      paymentsCount: disbursedPayments.length,
      rejectedPaymentsCount: rejectedPayments.length,
      billsCount: bills.length,
      receiptsCount: receipts.length,
      issuesCount: issues.length,
      workersPresentCount,
      headcountTotal: totalHeadcount,
      headcountArtisans: totalArtisans,
      headcountCraftsmen: totalCraftsmen,
      headcountLaborers: totalLaborers,
      staffPresentCount,
      reportsCount: dailyReports.length,
    },
    payments: enrichedPayments,
    moneyIn,
    bills: enrichedBills,
    receipts,
    issues,
    staffAttendance: staffRecords,
    workerAttendance: workerRecords,
    attendance: staffRecords,
    headcount: headcountRecords,
    dailyReports,
    recentActivityDates,
  };
}
