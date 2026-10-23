import { prisma } from "@/lib/db";
import { alertStaffNow } from "@/services/staff-alerts";

/**
 * Creates in-app notifications for a set of people, optionally every active
 * admin too. The person who caused the event is never notified.
 */
export async function notifyPeople(params: {
  organizationId: string;
  actorUserId: string;
  userIds?: (string | null | undefined)[];
  includeAdmins?: boolean;
  type: string;
  title: string;
  message: string;
  href: string;
  entityType: string;
  entityId: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
}): Promise<number> {
  const recipients = new Set<string>();
  if (params.includeAdmins) {
    const admins = await prisma.user.findMany({
      where: { organizationId: params.organizationId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ORG_ADMIN"] } },
      select: { id: true },
    });
    admins.forEach((a) => recipients.add(a.id));
  }
  for (const id of params.userIds || []) if (id) recipients.add(id);
  recipients.delete(params.actorUserId);
  if (recipients.size === 0) return 0;

  const message = params.message.length > 280 ? `${params.message.slice(0, 277)}...` : params.message;
  const result = await prisma.notification.createMany({
    data: Array.from(recipients).map((userId) => ({
      organizationId: params.organizationId,
      userId,
      type: params.type,
      title: params.title,
      message,
      severity: params.severity || "INFO",
      entityType: params.entityType,
      entityId: params.entityId,
      href: params.href,
    })),
  });
  // WhatsApp too, for the kinds the builder has switched on.
  await alertStaffNow(params.organizationId, Array.from(recipients));
  return result.count;
}

/** The project's manager plus everyone actively assigned to it. */
export async function projectTeamIds(projectId: string): Promise<string[]> {
  const [project, assignments] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { managerUserId: true } }),
    prisma.projectAssignment.findMany({ where: { projectId, status: "ACTIVE" }, select: { userId: true } }),
  ]);
  return Array.from(new Set([project?.managerUserId, ...assignments.map((a) => a.userId)].filter(Boolean) as string[]));
}
