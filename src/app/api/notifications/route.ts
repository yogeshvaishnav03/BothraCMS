import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export interface OperationalAlert {
  id: string;
  type: "LOW_STOCK" | "OVERDUE_BILL" | "ATTENDANCE_ANOMALY" | "DAILY_REPORT_MISSING";
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  message: string;
  href: string;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const alerts: OperationalAlert[] = [];
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // 1. Low Stock Alerts
    const materials = await prisma.material.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        stockBalances: true,
      },
    });

    for (const mat of materials) {
      const balances = (mat as any).stockBalances || [];
      const currentStock = balances.reduce((sum: number, b: any) => sum + (b.quantityOnHand || 0), 0);
      if (currentStock < mat.minStockQty) {
        alerts.push({
          id: `low-stock-${mat.id}`,
          type: "LOW_STOCK",
          severity: currentStock === 0 ? "CRITICAL" : "WARNING",
          title: `Low Stock: ${mat.name}`,
          message: `Current site stock is ${currentStock} ${mat.unitCode} (minimum required: ${mat.minStockQty} ${mat.unitCode}). Reorder required.`,
          href: `/materials/${mat.id}`,
          createdAt: now.toISOString(),
        });
      }
    }

    // 2. Overdue Payables
    const overdueBills = await prisma.bill.findMany({
      where: {
        organizationId: user.organizationId,
        status: "POSTED",
        dueDate: { lt: now },
      },
      include: {
        party: true,
        allocations: { where: { reversedAt: null } },
      },
      take: 10,
    });

    for (const bill of overdueBills) {
      const paid = bill.allocations.reduce((sum, a) => sum + a.amount, 0);
      const outstanding = bill.totalAmount - paid;
      if (outstanding > 0) {
        alerts.push({
          id: `overdue-bill-${bill.id}`,
          type: "OVERDUE_BILL",
          severity: "CRITICAL",
          title: `Overdue Payment: Bill #${bill.billNumber}`,
          message: `₹${(outstanding / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })} payable to ${bill.party.name} was due on ${bill.dueDate?.toLocaleDateString("en-IN")}.`,
          href: "/finance",
          createdAt: bill.dueDate ? bill.dueDate.toISOString() : now.toISOString(),
        });
      }
    }

    // 3. Attendance Anomalies (sessions checked in before today with no check-out)
    const danglingSessions = await prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        workDate: { lt: todayStr },
        checkOutAt: null,
      },
      include: {
        workforceMember: true,
        site: true,
      },
      take: 10,
    });

    for (const sess of danglingSessions) {
      alerts.push({
        id: `att-anomaly-${sess.id}`,
        type: "ATTENDANCE_ANOMALY",
        severity: "WARNING",
        title: `Unclosed Shift: ${sess.workforceMember.name}`,
        message: `Shift on ${sess.workDate} at ${sess.site.name} was never checked out. Supervisor correction needed.`,
        href: "/attendance",
        createdAt: sess.checkInAt.toISOString(),
      });
    }

    // 4. Daily Report check for active site today
    const sites = await prisma.site.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      take: 3,
    });

    for (const site of sites) {
      const reportToday = await prisma.dailySiteReport.findFirst({
        where: {
          organizationId: user.organizationId,
          reportDate: todayStr,
          project: { siteId: site.id },
        },
      });

      if (!reportToday) {
        alerts.push({
          id: `missing-report-${site.id}-${todayStr}`,
          type: "DAILY_REPORT_MISSING",
          severity: "INFO",
          title: `Daily Report Pending: ${site.name}`,
          message: `No supervisor daily report submitted yet for today (${todayStr}).`,
          href: "/projects",
          createdAt: now.toISOString(),
        });
      }
    }

    return jsonSuccess({
      unreadCount: alerts.length,
      alerts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
