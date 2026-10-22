import { prisma } from "@/lib/db";

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
  return result.count;
}
