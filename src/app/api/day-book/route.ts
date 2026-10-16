import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const todayStr = new Date().toISOString().split("T")[0];
    const date = searchParams.get("date") || todayStr;
    const siteId = searchParams.get("siteId");

    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    try {
      const orgId = user.organizationId;

      // 1. Payments made on this date
      const payments = await prisma.payment.findMany({
        where: {
          organizationId: orgId,
          paymentDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
          status: "POSTED",
        },
        include: {
          party: { select: { id: true, name: true, type: true } },
          bill: { select: { id: true, billNumber: true, totalAmount: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // 2. Bills recorded on this date
      const bills = await prisma.bill.findMany({
        where: {
          organizationId: orgId,
          billDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          party: { select: { id: true, name: true, type: true } },
          project: { select: { id: true, code: true, name: true, siteId: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // 3. Stock movements (Receipts and Issues) on this date
      const movements = await prisma.stockMovement.findMany({
        where: {
          organizationId: orgId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          material: { select: { id: true, sku: true, name: true, unitCode: true } },
          store: { select: { id: true, name: true, siteId: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const receipts = movements.filter((m) => m.movementType === "RECEIPT");
      const issues = movements.filter((m) => m.movementType === "ISSUE");

      // 4. Workforce attendance on this date
      const attendanceWhere: any = {
        organizationId: orgId,
        workDate: date,
      };
      if (siteId) {
        attendanceWhere.siteId = siteId;
      }
      const attendance = await prisma.attendanceSession.findMany({
        where: attendanceWhere,
        include: {
          workforceMember: { select: { id: true, employeeCode: true, name: true, trade: true } },
          site: { select: { id: true, name: true, code: true } },
        },
        orderBy: { checkInAt: "desc" },
      });

      // 5. Daily Site Reports (DSR) on this date
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

      // Summary metrics
      const totalPaymentsAmount = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
      const totalBillsAmount = bills.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
      const workersPresentCount = attendance.filter((a) =>
        ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)
      ).length;

      return jsonSuccess({
        date,
        summary: {
          totalPaymentsAmount,
          totalBillsAmount,
          paymentsCount: payments.length,
          billsCount: bills.length,
          receiptsCount: receipts.length,
          issuesCount: issues.length,
          workersPresentCount,
          reportsCount: dailyReports.length,
        },
        payments,
        bills,
        receipts,
        issues,
        attendance,
        dailyReports,
      });
    } catch {
      // Resilient fallback to dynamic store on serverless platforms
      const allPayments = dynamicStore.getPayments();
      const allBills = dynamicStore.getBills();
      const allAttendance = dynamicStore.getAttendance(date);
      const allReports = dynamicStore.getDailyReports({ reportDate: date });

      const filteredPayments = allPayments.filter((p: any) => {
        const pDate = p.paymentDate ? p.paymentDate.split("T")[0] : "";
        return pDate === date || pDate.startsWith(date);
      });

      const filteredBills = allBills.filter((b: any) => {
        const bDate = b.billDate ? b.billDate.split("T")[0] : "";
        return bDate === date || bDate.startsWith(date);
      });

      const filteredAttendance = siteId
        ? allAttendance.filter((a: any) => a.siteId === siteId)
        : allAttendance;

      const totalPaymentsAmount = filteredPayments.reduce((acc: number, p: any) => acc + (p.amount || 0), 0);
      const totalBillsAmount = filteredBills.reduce((acc: number, b: any) => acc + (b.totalAmount || 0), 0);
      const workersPresentCount = filteredAttendance.filter((a: any) =>
        ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)
      ).length;

      return jsonSuccess({
        date,
        summary: {
          totalPaymentsAmount,
          totalBillsAmount,
          paymentsCount: filteredPayments.length,
          billsCount: filteredBills.length,
          receiptsCount: 0,
          issuesCount: 0,
          workersPresentCount,
          reportsCount: allReports.length,
        },
        payments: filteredPayments,
        bills: filteredBills,
        receipts: [],
        issues: [],
        attendance: filteredAttendance,
        dailyReports: allReports,
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
