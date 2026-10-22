import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserContext, canReadFinance } from "@/lib/server-auth";
import { InventoryService } from "@/services/inventory-service";
import { ReminderService } from "@/services/reminder-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export interface OperationalAlert {
  id: string;
  type:
    | "TASK_REMINDER"
    | "LOW_STOCK"
    | "OVERDUE_BILL"
    | "ATTENDANCE_ANOMALY"
    | "DAILY_REPORT_MISSING"
    | "PURCHASE_ORDER"
    | "ORDER_APPROVAL_REQUEST"
    | "PAYMENT_APPROVAL_REQUEST"
    | "CHAT_MESSAGE"
    | "TASK_UPDATE"
    | "WORK_REPORT"
    | "MILESTONE_UPDATE"
    | "MATERIAL_REQUEST"
    | "DRAWING_ISSUED"
    | "QUALITY_ALERT"
    | "SAFETY_ALERT"
    | "EQUIPMENT_ALERT"
    | "SALES_LEAD"
    | "SALES_BOOKING";
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  message: string;
  href: string;
  createdAt: string;
  readAt?: string | null;
  isRead?: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    // 0. Automatically trigger idempotent due task reminder delivery
    await ReminderService.deliverDueReminders(user.organizationId);

    const alerts: OperationalAlert[] = [];
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const hasFinanceAccess = canReadFinance(user);

    // 1. In-App User Notifications (e.g. Task Reminders)
    const userNotifications = await prisma.notification.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.userId,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    for (const notif of userNotifications) {
      alerts.push({
        id: `notif-${notif.id}`,
        type: notif.type as any,
        severity: notif.severity as any,
        title: notif.title,
        message: notif.message,
        href: notif.href || "/tasks",
        createdAt: notif.createdAt.toISOString(),
        readAt: notif.readAt ? notif.readAt.toISOString() : null,
        isRead: !!notif.readAt,
      });
    }

    // 2. Pending Order Approval Queries for Super Admin / Org Admin
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
        const totalStr = po.totalAmount && hasFinanceAccess
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

      // 2b. Pending Payment Approval Queries (ONLY for users with finance:read)
      if (hasFinanceAccess) {
        const pendingPayments = await prisma.payment.findMany({
          where: {
            organizationId: user.organizationId,
            status: "PENDING_APPROVAL",
            isArchived: false,
          },
          include: {
            party: true,
            creator: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        });

        for (const pay of pendingPayments) {
          const payee = pay.recipientName || pay.party?.name || "Payee";
          const amountStr = `₹${(pay.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
          const accountStr = pay.payingAccount ? ` from ${pay.payingAccount}` : "";
          alerts.push({
            id: `payment-approval-${pay.id}`,
            type: "PAYMENT_APPROVAL_REQUEST",
            severity: "WARNING",
            title: `Super Admin Approval: Payment to ${payee} (${amountStr})`,
            message: `${pay.creator?.name || "Finance team"} submitted payment query of ${amountStr} to ${pay.recipientType || "Party"} "${payee}"${accountStr}. Reason: "${pay.approvalQuery || "Disbursement"}". Super Admin confirmation required.`,
            href: "/admin",
            createdAt: pay.createdAt.toISOString(),
          });
        }
      }
    }

    // 3. Authoritative Low Stock Alerts from Ledger
    const stockSummaries = await InventoryService.getAuthoritativeStockSummary(user.organizationId);
    const lowStockItems = stockSummaries.filter((m) => m.isLowStock);

    for (const mat of lowStockItems) {
      alerts.push({
        id: `low-stock-${mat.id}`,
        type: "LOW_STOCK",
        severity: mat.alertSeverity === "CRITICAL" ? "CRITICAL" : "WARNING",
        title: `Low Stock: ${mat.name}`,
        message: mat.alertReason,
        href: `/materials/${mat.id}`,
        createdAt: now.toISOString(),
      });
    }

    // 4. Overdue Payables (Protected by finance:read)
    if (hasFinanceAccess) {
      const overdueBills = await prisma.bill.findMany({
        where: {
          organizationId: user.organizationId,
          status: "POSTED",
          isArchived: false,
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
    }

    // 5. Attendance Anomalies
    const danglingSessions = await prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        workDate: { lt: todayStr },
        checkOutAt: null,
        isArchived: false,
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

    // 6. Approved / Active Purchase Orders Placed to Vendors
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

    // 7. Unread Chat Messages for Current Receiver
    let totalUnreadChatCount = 0;
    let latestChatMessage: { id: string; senderName: string; content: string; createdAt: string } | null = null;

    const userParticipantConvs = await prisma.conversationParticipant.findMany({
      where: {
        userId: user.userId,
        conversation: {
          organizationId: user.organizationId,
        },
      },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, name: true, role: true } },
              },
            },
            messages: {
              where: {
                senderId: { not: user.userId },
              },
              orderBy: { createdAt: "desc" },
              take: 5,
              include: {
                sender: { select: { id: true, name: true, role: true } },
              },
            },
          },
        },
      },
    });

    for (const record of userParticipantConvs) {
      const conv = record.conversation;
      const lastRead = record.lastReadAt;
      const unreadMsgs = conv.messages.filter(
        (m) => !lastRead || m.createdAt > lastRead
      );

      if (unreadMsgs.length > 0) {
        totalUnreadChatCount += unreadMsgs.length;
        const latest = unreadMsgs[0];
        const otherParticipant =
          conv.type === "DIRECT"
            ? conv.participants.find((p) => p.userId !== user.userId)?.user
            : null;
        const senderName = latest.sender?.name || otherParticipant?.name || "Team Member";
        const convName = conv.type === "GROUP" ? conv.name || "Group Chat" : "";

        const title =
          conv.type === "GROUP"
            ? `New message in "${convName}" from ${senderName}`
            : `New message from ${senderName}`;

        const rawContent =
          latest.imageUrl && (!latest.content || latest.content === "[Photo]")
            ? "📷 [Photo]"
            : latest.content;
        const snippet =
          rawContent.length > 80
            ? rawContent.slice(0, 80) + "..."
            : rawContent;

        if (!latestChatMessage || new Date(latest.createdAt) > new Date(latestChatMessage.createdAt)) {
          latestChatMessage = {
            id: latest.id,
            senderName,
            content: snippet,
            createdAt: latest.createdAt.toISOString(),
          };
        }

        alerts.unshift({
          id: `chat-${conv.id}-${latest.id}`,
          type: "CHAT_MESSAGE",
          severity: "INFO",
          title,
          message:
            unreadMsgs.length > 1
              ? `[${unreadMsgs.length} new] "${snippet}"`
              : `"${snippet}"`,
          href: "/chat",
          createdAt: latest.createdAt.toISOString(),
        });
      }
    }

    const unreadAlertsCount = alerts.filter((a) => !a.isRead).length;

    return jsonSuccess({
      unreadCount: unreadAlertsCount,
      unreadChatCount: totalUnreadChatCount,
      latestChatMessage,
      alerts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const body = await req.json().catch(() => ({}));
    const { notificationId, all } = body;

    if (all) {
      const count = await ReminderService.markAllAsRead(user.userId, user.organizationId);
      return jsonSuccess({ markedCount: count, message: "All notifications marked as read" });
    }

    if (notificationId) {
      const cleanId = notificationId.startsWith("notif-")
        ? notificationId.replace("notif-", "")
        : notificationId;
      const success = await ReminderService.markAsRead(cleanId, user.userId);
      return jsonSuccess({ success, message: "Notification marked as read" });
    }

    return jsonError("Missing notificationId or all flag", "BAD_REQUEST", 400);
  } catch (error) {
    return handleApiError(error);
  }
}
