import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export interface OperationalAlert {
  id: string;
  type:
    | "LOW_STOCK"
    | "OVERDUE_BILL"
    | "ATTENDANCE_ANOMALY"
    | "DAILY_REPORT_MISSING"
    | "PURCHASE_ORDER"
    | "ORDER_APPROVAL_REQUEST";
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

    // 1. Pending Order Approval Queries for Super Admin / Org Admin
    if (user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN") {
      const pendingOrders = await prisma.purchaseOrder.findMany({
        where: {
          organizationId: user.organizationId,
          status: "PENDING_APPROVAL",
        },
        include: {
          material: { select: { id: true, name: true, unitCode: true } },
          vendor: { select: { name: true } },
          creator: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      for (const po of pendingOrders) {
        const totalStr = po.totalAmount
          ? ` (₹${(po.totalAmount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })})`
          : "";
        alerts.push({
          id: `order-approval-${po.id}`,
          type: "ORDER_APPROVAL_REQUEST",
          severity: "WARNING",
          title: `Super Admin Approval: ${po.orderNumber}`,
          message: `${po.creator?.name || "Requester"} submitted order query for ${po.quantity} ${po.unitCode} ${po.material.name} from ${po.vendor.name}${totalStr}. Super Admin confirmation required.`,
          href: "/admin",
          createdAt: po.createdAt.toISOString(),
        });
      }
    }

    // 2. Low Stock Alerts
    const materials = await prisma.material.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        stockBalances: true,
      },
    });

    for (const mat of materials) {
      const balances = (mat as any).stockBalances || [];
      const currentStock = balances.reduce((sum: number, b: any) => sum + (b.quantityOnHand || 0), 0);
      if (mat.minStockQty > 0 && currentStock <= mat.minStockQty) {
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

    // 3. Overdue Payables
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
      const paid = bill.allocations.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
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

    // 4. Attendance Anomalies
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

    // 5. Approved / Active Purchase Orders Placed to Vendors
    const activeOrders = await prisma.purchaseOrder.findMany({
      where: {
        organizationId: user.organizationId,
        status: { in: ["APPROVED", "PLACED"] },
      },
      include: {
        material: true,
        vendor: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    for (const po of activeOrders) {
      alerts.push({
        id: `order-placed-${po.id}`,
        type: "PURCHASE_ORDER",
        severity: "INFO",
        title: `Material Order: ${po.orderNumber}`,
        message: `Order for ${po.quantity} ${po.unitCode} of ${po.material.name} approved with ${po.vendor.name}. Vendor notification active.`,
        href: `/materials/${po.materialId}`,
        createdAt: po.createdAt.toISOString(),
      });
    }

    return jsonSuccess({
      unreadCount: alerts.length,
      alerts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
