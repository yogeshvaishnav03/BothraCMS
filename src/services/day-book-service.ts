import { prisma } from "@/lib/db";
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

export async function fetchDayBookData(orgId: string, date: string, siteId?: string) {
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);
  // Buffer for timezone differences (+/- 14 hours)
  const broadStart = new Date(startOfDay.getTime() - 14 * 3600 * 1000);
  const broadEnd = new Date(endOfDay.getTime() + 14 * 3600 * 1000);

  // 1. Payments made on this date
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

  const rawPayments = await prisma.payment.findMany({
    where: paymentWhere,
    include: {
      party: { select: { id: true, name: true, partyType: true } },
      project: { select: { id: true, name: true, code: true, siteId: true } },
      allocations: { include: { bill: { select: { id: true, billNumber: true, totalAmount: true } } } },
      creator: { select: { id: true, name: true } },
    },
    orderBy: { paymentDate: "desc" },
  });

  const filteredPayments = rawPayments.filter((p) => {
    return matchesDate(p.paymentDate, date) || matchesDate(p.createdAt, date);
  });

  const payments = filteredPayments.map((p) => ({
    ...p,
    paymentMethod: p.method,
  }));

  // 2. Bills recorded on this date
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

  const rawBills = await prisma.bill.findMany({
    where: billWhere,
    include: {
      party: { select: { id: true, name: true, partyType: true } },
      project: { select: { id: true, code: true, name: true, siteId: true } },
    },
    orderBy: { billDate: "desc" },
  });

  const bills = rawBills.filter((b) => {
    return matchesDate(b.billDate, date) || matchesDate(b.createdAt, date);
  });

  // 3. Stock movements
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

  const rawMovements = await prisma.stockMovement.findMany({
    where: stockWhere,
    include: {
      material: { select: { id: true, sku: true, name: true, unitCode: true } },
      store: { select: { id: true, name: true, siteId: true } },
      creator: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const movements = rawMovements.filter((m) => {
    return matchesDate(m.movementAt, date) || matchesDate(m.createdAt, date);
  });

  const receipts = movements.filter((m) => m.movementType === "RECEIPT");
  const issues = movements.filter((m) => m.movementType === "ISSUE");

  // 4. Workforce: Attendance Sessions & Headcount
  const attendanceWhere: any = {
    organizationId: orgId,
    workDate: date,
    isArchived: false,
  };
  if (siteId) {
    attendanceWhere.siteId = siteId;
  }

  const [attendance, headcountRecords, allRecentHeadcount] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: attendanceWhere,
      include: {
        workforceMember: { select: { id: true, employeeCode: true, name: true, workerType: true } },
        site: { select: { id: true, name: true, code: true } },
      },
      orderBy: { checkInAt: "desc" },
    }).catch(() => []),
    WorkforceHeadcountService.listRecords(orgId, { siteId, date }).catch(() => []),
    WorkforceHeadcountService.listRecords(orgId, { siteId }).catch(() => []),
  ]);

  // 5. Daily Site Reports
  const reportWhere: any = {
    organizationId: orgId,
    reportDate: date,
  };
  if (siteId) {
    reportWhere.project = { siteId };
  }
  const dailyReports = await prisma.dailySiteReport.findMany({
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
  });

  // 6. Money in: customer receipts against bookings
  const moneyIn = (
    await prisma.salesReceipt.findMany({
      where: { organizationId: orgId, date, cancelledAt: null, booking: { status: "ACTIVE", ...(siteId ? { unit: { project: { siteId } } } : {}) } },
      include: {
        booking: { select: { id: true, bookingNumber: true, customerName: true, unit: { select: { unitNumber: true, project: { select: { id: true, name: true } } } } } },
        installment: { select: { label: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  );

  // Summaries
  const totalPaymentsAmount = payments.reduce((acc: number, p: any) => acc + (p.amount || 0), 0);
  const totalBillsAmount = bills.reduce((acc: number, b: any) => acc + (b.totalAmount || 0), 0);

  const totalHeadcount = headcountRecords.reduce((s, r) => s + (r.grandTotal || 0), 0);
  const totalArtisans = headcountRecords.reduce((s, r) => s + (r.artisanCount ?? r.artisanTotal ?? 0), 0);
  const totalCraftsmen = headcountRecords.reduce((s, r) => s + (r.craftsmanCount ?? r.craftsmanTotal ?? 0), 0);
  const totalLaborers = headcountRecords.reduce((s, r) => s + (r.laborerTotal || 0), 0);

  const staffPresentCount = attendance.filter((a) =>
    ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)
  ).length;

  const workersPresentCount = totalHeadcount > 0 ? totalHeadcount : staffPresentCount;

  const recentActivityDates = Array.from(
    new Set(
      allRecentHeadcount
        .map((r) => r.date)
        .filter((d): d is string => Boolean(d) && d !== date)
    )
  ).slice(0, 3);

  return {
    date,
    summary: {
      totalPaymentsAmount,
      totalBillsAmount,
      totalMoneyInAmount: moneyIn.reduce((acc, r) => acc + r.amount, 0),
      moneyInCount: moneyIn.length,
      paymentsCount: payments.length,
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
    payments,
    moneyIn,
    bills,
    receipts,
    issues,
    attendance,
    headcount: headcountRecords,
    dailyReports,
    recentActivityDates,
  };
}
