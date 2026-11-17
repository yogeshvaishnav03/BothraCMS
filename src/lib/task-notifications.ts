import { prisma } from "@/lib/db";
import { pushToPeople } from "@/lib/push";

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

  // Push notifications to assigned staff and managers on laptop and mobile
  await pushToPeople(params.organizationId, Array.from(recipients), {
    title: params.title,
    body: params.message,
    href: `/tasks?task=${params.task.id}`,
    tag: `TASK:${params.task.id}`,
  }).catch((err) => {
    console.warn("[notifyTaskUpdate] Push failed:", err);
  });

  return result.count;
}

/**
 * Sends a task/query assignment notification to the assigned user with rich context:
 * - Title including task/query title
 * - Project & Site name
 * - Assigned-by user name
 * - Priority & creation time
 * - Priority-based delivery severity (CRITICAL, HIGH/URGENT -> WARNING, MEDIUM/LOW -> INFO)
 * - Direct link to task
 * - Duplicate prevention (suppresses duplicates within 60s window)
 * - Non-blocking asynchronous delivery
 */
export async function notifyTaskAssigned(params: {
  organizationId: string;
  actorUser: { id: string; name: string };
  assigneeUserId: string;
  task: {
    id: string;
    title: string;
    priority: string;
    taskType?: string;
    project?: { name: string; code?: string; site?: { name: string; code?: string } | null } | null;
  };
}): Promise<number> {
  if (!params.assigneeUserId || params.assigneeUserId === params.actorUser.id) return 0;

  // Duplicate prevention: check if a notification for this task and user was sent in the last 60 seconds
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: {
      organizationId: params.organizationId,
      userId: params.assigneeUserId,
      entityType: "TASK",
      entityId: params.task.id,
      createdAt: { gte: oneMinuteAgo },
    },
    select: { id: true },
  });
  if (existing) {
    return 0; // Prevent duplicate notification
  }

  const isQuery = params.task.taskType?.startsWith("REQUEST_");
  const kindLabel = isQuery ? "Site Query / Request" : "Task";
  const projName = params.task.project?.name || "General Project";
  const siteName = params.task.project?.site?.name;
  const locationInfo = siteName ? `${projName} (${siteName})` : projName;
  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  let severity: "CRITICAL" | "WARNING" | "INFO" = "INFO";
  if (params.task.priority === "CRITICAL") severity = "CRITICAL";
  else if (params.task.priority === "HIGH" || params.task.priority === "URGENT") severity = "WARNING";

  const notifTitle = `[${params.task.priority}] New ${kindLabel} Assigned: "${params.task.title}"`;
  const notifMessage = `${params.actorUser.name} assigned you a ${kindLabel.toLowerCase()}: "${params.task.title}". Project: ${locationInfo}. Priority: ${params.task.priority} at ${timeStr}.`;

  await prisma.notification.create({
    data: {
      organizationId: params.organizationId,
      userId: params.assigneeUserId,
      type: isQuery ? "QUERY_ASSIGNED" : "TASK_ASSIGNED",
      title: notifTitle,
      message: notifMessage.length > 280 ? `${notifMessage.slice(0, 277)}...` : notifMessage,
      severity,
      entityType: "TASK",
      entityId: params.task.id,
      href: `/tasks?task=${params.task.id}`,
    },
  });

  // Non-blocking push delivery
  pushToPeople(params.organizationId, [params.assigneeUserId], {
    title: notifTitle,
    body: notifMessage,
    href: `/tasks?task=${params.task.id}`,
    tag: `TASK:${params.task.id}`,
  }).catch((err) => {
    console.warn("[notifyTaskAssigned] Push delivery warning:", err);
  });

  return 1;
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
