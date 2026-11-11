import { prisma } from "@/lib/db";
import { alertStaffNow } from "@/services/staff-alerts";
import { pushToPeople } from "@/lib/push";

export class ReminderService {
  /**
   * Scans for tasks with reminderAt <= now and reminderDeliveredAt == null,
   * creates in-app Notification records, and marks reminderDeliveredAt.
   * Completely idempotent: tasks are never notified twice.
   */
  static async deliverDueReminders(organizationId?: string): Promise<number> {
    const now = new Date();

    const where: any = {
      reminderAt: { lte: now },
      reminderDeliveredAt: null,
      status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED", "ARCHIVED"] },
      isArchived: false,
    };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const dueTasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    let deliveredCount = 0;
    const deliveredReminders: Array<{
      organizationId: string;
      userIds: string[];
      title: string;
      body: string;
      href: string;
      tag: string;
    }> = [];

    for (const task of dueTasks) {
      let committedPayload: (typeof deliveredReminders)[number] | null = null;
      await prisma.$transaction(async (tx: any) => {
        // Double check within transaction to prevent race conditions
        const freshTask = await tx.task.findUnique({
          where: { id: task.id },
          select: { reminderDeliveredAt: true, status: true, isArchived: true },
        });

        if (
          !freshTask ||
          freshTask.reminderDeliveredAt ||
          freshTask.isArchived ||
          ["COMPLETED", "VERIFIED", "CANCELLED", "ARCHIVED"].includes(freshTask.status)
        ) {
          return;
        }

        const recipients = new Set<string>();
        if (task.assigneeUserId) recipients.add(task.assigneeUserId);
        if (task.createdBy && !recipients.has(task.createdBy)) {
          recipients.add(task.createdBy);
        }

        const dueFormatted = task.dueAt
          ? new Date(task.dueAt).toLocaleString("en-IN", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Soon";

        const title = `Task Reminder: ${task.title}`;
        const message = `Reminder for task "${task.title}" in project "${task.project.name}". Due: ${dueFormatted}. Priority: ${task.priority}.`;
        const href = `/tasks?projectId=${task.projectId}`;

        for (const recipientId of Array.from(recipients)) {
          await tx.notification.create({
            data: {
              organizationId: task.organizationId,
              userId: recipientId,
              type: "TASK_REMINDER",
              title,
              message,
              severity: task.priority === "CRITICAL" || task.priority === "HIGH" ? "WARNING" : "INFO",
              entityType: "TASK",
              entityId: task.id,
              href,
              deliveredAt: now,
            },
          });
        }

        await tx.task.update({
          where: { id: task.id },
          data: { reminderDeliveredAt: now },
        });

        deliveredCount++;
        committedPayload = {
          organizationId: task.organizationId,
          userIds: Array.from(recipients),
          title,
          body: message,
          href,
          tag: `TASK_REMINDER:${task.id}`,
        };
      });
      if (committedPayload) {
        deliveredReminders.push(committedPayload);
      }
    }

    // Push & WhatsApp the reminders so mobile devices alert immediately.
    if (deliveredCount > 0) {
      await Promise.all(
        deliveredReminders.map((r) =>
          pushToPeople(r.organizationId, r.userIds, {
            title: r.title,
            body: r.body,
            href: r.href,
            tag: r.tag,
          }).catch((err) => {
            console.warn("[ReminderService] Push notification delivery failed:", err);
          })
        )
      );
      for (const orgId of new Set(dueTasks.map((t: any) => t.organizationId as string))) await alertStaffNow(orgId);
    }

    return deliveredCount;
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const notif = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notif) return false;

    await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
    return true;
  }

  /**
   * Mark all notifications as read for user
   */
  static async markAllAsRead(userId: string, organizationId: string): Promise<number> {
    const res = await prisma.notification.updateMany({
      where: { userId, organizationId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }
}
