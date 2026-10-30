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

    // Retrieve all read notification and alert identifiers for the current user
    const readNotifications = await prisma.notification.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.userId,
        readAt: { not: null },
      },
      select: {
        id: true,
        entityId: true,
      },
    });

    const readEntityIdSet = new Set<string>();
    for (const rn of readNotifications) {
      readEntityIdSet.add(rn.id);
      readEntityIdSet.add(`notif-${rn.id}`);
      if (rn.entityId) {
        readEntityIdSet.add(rn.entityId);
        if (rn.entityId.includes("-")) {
          const parts = rn.entityId.split("-");
          readEntityIdSet.add(parts.slice(-1)[0]);
        }
      }
    }

    // 1. In-App User Notifications (e.g. Task Reminders)
    const userNotifications = await prisma.notification.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.userId,
        type: { not: "OPERATIONAL_ALERT" },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    for (const notif of userNotifications) {
      const isRead =
        !!notif.readAt ||
        readEntityIdSet.has(notif.id) ||
        readEntityIdSet.has(`notif-${notif.id}`);
      alerts.push({
        id: `notif-${notif.id}`,
        type: notif.type as any,
        severity: notif.severity as any,
        title: notif.title,
        message: notif.message,
        href: notif.href || "/tasks",
        createdAt: notif.createdAt.toISOString(),
        readAt: notif.readAt ? notif.readAt.toISOString() : null,
        isRead,
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
        const totalStr =
          po.totalAmount && hasFinanceAccess
            ? ` (₹${(po.totalAmount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })})`
            : "";
        const alertId = `order-approval-${po.id}`;
        const isRead = readEntityIdSet.has(alertId) || readEntityIdSet.has(po.id);
        alerts.push({
          id: alertId,
          type: "ORDER_APPROVAL_REQUEST",
          severity: "WARNING",
          title: `Super Admin Approval: ${po.orderNumber}`,
          message: `${po.creator?.name || "Requester"} submitted order query for ${po.quantity} ${po.unitCode} ${po.material.name} from ${po.vendor.name}${totalStr}. Super Admin confirmation required.`,
          href: "/admin",
          createdAt: po.createdAt.toISOString(),
          isRead,
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
          const alertId = `payment-approval-${pay.id}`;
          const isRead = readEntityIdSet.has(alertId) || readEntityIdSet.has(pay.id);
          alerts.push({
            id: alertId,
            type: "PAYMENT_APPROVAL_REQUEST",
            severity: "WARNING",
            title: `Super Admin Approval: Payment to ${payee} (${amountStr})`,
            message: `${pay.creator?.name || "Finance team"} submitted payment query of ${amountStr} to ${pay.recipientType || "Party"} "${payee}"${accountStr}. Reason: "${pay.approvalQuery || "Disbursement"}". Super Admin confirmation required.`,
            href: "/admin",
            createdAt: pay.createdAt.toISOString(),
            isRead,
          });
        }
      }
    }

    // 3. Authoritative Low Stock Alerts from Ledger
    const stockSummaries = await InventoryService.getAuthoritativeStockSummary(user.organizationId);
    const lowStockItems = stockSummaries.filter((m) => m.isLowStock);

    for (const mat of lowStockItems) {
      const alertId = `low-stock-${mat.id}`;
      const isRead = readEntityIdSet.has(alertId) || readEntityIdSet.has(mat.id);
      alerts.push({
        id: alertId,
        type: "LOW_STOCK",
        severity: mat.alertSeverity === "CRITICAL" ? "CRITICAL" : "WARNING",
        title: `Low Stock: ${mat.name}`,
        message: mat.alertReason,
        href: `/materials/${mat.id}`,
        createdAt: now.toISOString(),
        isRead,
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
          const alertId = `overdue-bill-${bill.id}`;
          const isRead = readEntityIdSet.has(alertId) || readEntityIdSet.has(bill.id);
          alerts.push({
            id: alertId,
            type: "OVERDUE_BILL",
            severity: "CRITICAL",
            title: `Overdue Payment: Bill #${bill.billNumber}`,
            message: `₹${(outstanding / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })} payable to ${bill.party.name} was due on ${bill.dueDate?.toLocaleDateString("en-IN")}.`,
            href: "/finance",
            createdAt: bill.dueDate ? bill.dueDate.toISOString() : now.toISOString(),
            isRead,
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
      const alertId = `att-anomaly-${sess.id}`;
      const isRead = readEntityIdSet.has(alertId) || readEntityIdSet.has(sess.id);
      alerts.push({
        id: alertId,
        type: "ATTENDANCE_ANOMALY",
        severity: "WARNING",
        title: `Unclosed Shift: ${sess.workforceMember.name}`,
        message: `Shift on ${sess.workDate} at ${sess.site.name} was never checked out. Supervisor correction needed.`,
        href: "/attendance",
        createdAt: sess.checkInAt.toISOString(),
        isRead,
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
      const alertId = `order-placed-${po.id}`;
      const isRead = readEntityIdSet.has(alertId) || readEntityIdSet.has(po.id);
      alerts.push({
        id: alertId,
        type: "PURCHASE_ORDER",
        severity: "INFO",
        title: `Material Order: ${po.orderNumber}`,
        message: `Order for ${po.quantity} ${po.unitCode} of ${po.material.name} approved with ${po.vendor.name}. Vendor notification active.`,
        href: `/materials/${po.materialId}`,
        createdAt: po.createdAt.toISOString(),
        isRead,
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

        const alertId = `chat-${conv.id}-${latest.id}`;
        const isRead = readEntityIdSet.has(alertId) || readEntityIdSet.has(latest.id);

        alerts.unshift({
          id: alertId,
          type: "CHAT_MESSAGE",
          severity: "INFO",
          title,
          message:
            unreadMsgs.length > 1
              ? `[${unreadMsgs.length} new] "${snippet}"`
              : `"${snippet}"`,
          href: "/chat",
          createdAt: latest.createdAt.toISOString(),
          isRead,
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
    const { notificationId, all, alertIds } = body;
    const now = new Date();

    if (all) {
      // 1. Mark all existing Notification records as read for this user
      await ReminderService.markAllAsRead(user.userId, user.organizationId);

      // 2. Mark all conversations for this user as read
      await prisma.conversationParticipant.updateMany({
        where: { userId: user.userId },
        data: { lastReadAt: now },
      });

      // 3. Collect all alert IDs to mark as acknowledged in Notification table
      const idsToMark: string[] = Array.isArray(alertIds) ? [...alertIds] : [];

      if (idsToMark.length === 0) {
        // Collect current derived alerts server-side if not explicitly provided
        const todayStr = now.toISOString().split("T")[0];
        const hasFinanceAccess = canReadFinance(user);

        const [pendingOrders, pendingPayments, danglingSessions, activeOrders, lowStockItems, overdueBills] = await Promise.all([
          (user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN")
            ? prisma.purchaseOrder.findMany({ where: { organizationId: user.organizationId, status: "PENDING_APPROVAL" }, select: { id: true } })
            : [],
          (user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN") && hasFinanceAccess
            ? prisma.payment.findMany({ where: { organizationId: user.organizationId, status: "PENDING_APPROVAL", isArchived: false }, select: { id: true } })
            : [],
          prisma.attendanceSession.findMany({ where: { organizationId: user.organizationId, workDate: { lt: todayStr }, checkOutAt: null, isArchived: false }, select: { id: true } }),
          prisma.purchaseOrder.findMany({ where: { organizationId: user.organizationId, status: { in: ["APPROVED", "PLACED"] } }, select: { id: true } }),
          InventoryService.getAuthoritativeStockSummary(user.organizationId).then((items) => items.filter((m) => m.isLowStock).map((m) => ({ id: m.id }))).catch(() => []),
          hasFinanceAccess
            ? prisma.bill.findMany({ where: { organizationId: user.organizationId, status: "POSTED", isArchived: false, dueDate: { lt: now } }, select: { id: true } })
            : [],
        ]);

        idsToMark.push(
          ...pendingOrders.map((o) => `order-approval-${o.id}`),
          ...pendingPayments.map((p) => `payment-approval-${p.id}`),
          ...danglingSessions.map((s) => `att-anomaly-${s.id}`),
          ...activeOrders.map((o) => `order-placed-${o.id}`),
          ...lowStockItems.map((m) => `low-stock-${m.id}`),
          ...overdueBills.map((b) => `overdue-bill-${b.id}`)
        );
      }

      if (idsToMark.length > 0) {
        const cleanIds = idsToMark.map((id) =>
          id.startsWith("notif-") ? id.replace("notif-", "") : id
        );

        const existing = await prisma.notification.findMany({
          where: {
            userId: user.userId,
            organizationId: user.organizationId,
            OR: [{ id: { in: cleanIds } }, { entityId: { in: idsToMark } }],
          },
          select: { id: true, entityId: true },
        });

        const alreadyReadIds = new Set(
          existing.flatMap((e) => [e.id, `notif-${e.id}`, e.entityId].filter(Boolean) as string[])
        );

        const toCreate = idsToMark
          .filter((id) => !id.startsWith("notif-") && !alreadyReadIds.has(id))
          .map((id) => ({
            organizationId: user.organizationId,
            userId: user.userId,
            type: "OPERATIONAL_ALERT",
            title: "Acknowledged Alert",
            message: "Operational alert acknowledged by user",
            entityType: "ALERT",
            entityId: id,
            readAt: now,
          }));

        if (toCreate.length > 0) {
          await prisma.notification.createMany({
            data: toCreate,
          });
        }
      }

      return jsonSuccess({ success: true, message: "All notifications marked as read" });
    }

    if (notificationId) {
      const cleanId = notificationId.startsWith("notif-")
        ? notificationId.replace("notif-", "")
        : notificationId;

      // 1. Check if an existing Notification record exists by id or entityId
      const existing = await prisma.notification.findFirst({
        where: {
          organizationId: user.organizationId,
          userId: user.userId,
          OR: [{ id: cleanId }, { entityId: notificationId }, { entityId: cleanId }],
        },
      });

      if (existing) {
        await prisma.notification.update({
          where: { id: existing.id },
          data: { readAt: now },
        });
      } else {
        // 2. Persist an acknowledged record for this alert
        await prisma.notification.create({
          data: {
            organizationId: user.organizationId,
            userId: user.userId,
            type: "OPERATIONAL_ALERT",
            title: "Acknowledged Alert",
            message: "Operational alert acknowledged by user",
            entityType: "ALERT",
            entityId: notificationId,
            readAt: now,
          },
        });
      }

      // If it's a chat message, also update conversation lastReadAt
      if (notificationId.startsWith("chat-")) {
        const parts = notificationId.split("-");
        const convId = parts[1];
        if (convId) {
          await prisma.conversationParticipant.updateMany({
            where: { conversationId: convId, userId: user.userId },
            data: { lastReadAt: now },
          });
        }
      }

      return jsonSuccess({ success: true, message: "Notification marked as read" });
    }

    return jsonError("Missing notificationId or all flag", "BAD_REQUEST", 400);
  } catch (error) {
    return handleApiError(error);
  }
}
