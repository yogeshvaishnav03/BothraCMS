import { prisma } from "@/lib/db";

/**
 * Sends a task update to the people who need to know: every active admin,
 * plus whoever assigned or holds the task. The person who made the change
 * is never notified about their own update.
 */
export async function notifyTaskUpdate(params: {
  organizationId: string;
  actorUserId: string;
  task: { id: string; title: string; createdBy: string; assigneeUserId: string | null };
  title: string;
  message: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  extraRecipientIds?: (string | null | undefined)[];
}): Promise<number> {
  const admins = await prisma.user.findMany({
    where: {
      organizationId: params.organizationId,
      status: "ACTIVE",
      role: { in: ["SUPER_ADMIN", "ORG_ADMIN"] },
    },
    select: { id: true },
  });

  const recipients = new Set<string>(admins.map((a) => a.id));
  recipients.add(params.task.createdBy);
  if (params.task.assigneeUserId) recipients.add(params.task.assigneeUserId);
  for (const id of params.extraRecipientIds || []) if (id) recipients.add(id);
  recipients.delete(params.actorUserId);
  if (recipients.size === 0) return 0;

  const result = await prisma.notification.createMany({
    data: Array.from(recipients).map((userId) => ({
      organizationId: params.organizationId,
      userId,
      type: "TASK_UPDATE",
      title: params.title,
      message: params.message.length > 280 ? `${params.message.slice(0, 277)}...` : params.message,
      severity: params.severity || "INFO",
      entityType: "TASK",
      entityId: params.task.id,
      href: `/tasks?task=${params.task.id}`,
    })),
  });
  return result.count;
}

export const STATUS_LABELS: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  VERIFIED: "Verified",
  ARCHIVED: "Archived",
};

export function statusLabel(status: string | null | undefined): string {
  return (status && STATUS_LABELS[status]) || status || "";
}
