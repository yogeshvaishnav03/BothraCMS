import { prisma } from "@/lib/db";
import { channels, indianMobile, messagingSettings, sendWhatsAppTemplate, type MessagingSettings } from "@/lib/messaging";
import { istDateKey, istDayBounds } from "@/lib/ist-date";

/**
 * WhatsApp alerts to staff, on top of the bell in the app (Settings →
 * Messages → staff alerts).
 *
 * - Approvals: payments and purchase orders waiting for an admin, and
 *   material requests.
 * - Tasks: task reminders, and each morning a list of a person's overdue tasks.
 * - Site alerts: quality, safety and equipment alerts, and anything critical.
 *
 * Everything waiting for a person goes in one message, at most one every 15
 * minutes, and none between 9 pm and 8 am. Anything held back goes with the
 * next message or the morning run.
 */

export const STAFF_TYPES = {
  approvals: ["MATERIAL_REQUEST", "PAYMENT_APPROVAL", "ORDER_APPROVAL"],
  tasks: ["TASK_REMINDER"],
  site: ["QUALITY_ALERT", "SAFETY_ALERT", "EQUIPMENT_ALERT"],
};

const GAP_MS = 15 * 60 * 1000;
const LOOK_BACK_MS = 24 * 60 * 60 * 1000;
const APPROVAL_LOOK_BACK_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_ROLES = ["SUPER_ADMIN", "ORG_ADMIN"];

/** Hour of the day in India. */
const istHour = (d: Date) => new Date(d.getTime() + 330 * 60 * 1000).getUTCHours();
export const isQuietHour = (d: Date) => {
  const h = istHour(d);
  return h >= 21 || h < 8;
};

/** WhatsApp template values may not have new lines, tabs or long runs of spaces. */
export const oneLine = (v: string, max = 600) => {
  const s = v.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

interface Item {
  text: string;
  href: string;
  notificationId?: string;
  ref?: { type: string; id: string };
}

function enabledTypes(s: MessagingSettings) {
  return [...(s.staffApprovals ? STAFF_TYPES.approvals : []), ...(s.staffTasks ? STAFF_TYPES.tasks : []), ...(s.staffSiteAlerts ? STAFF_TYPES.site : [])];
}

function siteBase(s: MessagingSettings) {
  return (s.siteUrl || process.env.APP_URL || "").replace(/\/+$/, "");
}

/** The words of a message that covers these items. */
export function summarise(items: Item[]): string {
  if (items.length === 1) return oneLine(items[0].text, 500);
  const shown = items.slice(0, 3).map((i) => oneLine(i.text, 150));
  const more = items.length > 3 ? `; and ${items.length - 3} more` : "";
  return oneLine(`${items.length} things need you: ${shown.join("; ")}${more}`, 700);
}

/** Pending payments and orders an admin has not been told about on WhatsApp. */
async function approvalItems(organizationId: string, to: string, now: Date): Promise<Item[]> {
  const since = new Date(now.getTime() - APPROVAL_LOOK_BACK_MS);
  const [payments, orders] = await Promise.all([
    prisma.payment.findMany({
      where: { organizationId, status: "PENDING_APPROVAL", isArchived: false, createdAt: { gte: since } },
      select: { id: true, amount: true, recipientName: true, party: { select: { name: true } }, creator: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    prisma.purchaseOrder.findMany({
      where: { organizationId, status: "PENDING_APPROVAL", createdAt: { gte: since } },
      select: { id: true, orderNumber: true, totalAmount: true, vendor: { select: { name: true } }, creator: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]);
  if (!payments.length && !orders.length) return [];
  const told = await prisma.messageLog.findMany({
    where: { organizationId, to, kind: "STAFF", refType: { in: ["PAYMENT", "PURCHASE_ORDER"] }, refId: { in: [...payments.map((p) => p.id), ...orders.map((o) => o.id)] } },
    select: { refId: true },
  });
  const done = new Set(told.map((t) => t.refId));
  return [
    ...payments
      .filter((p) => !done.has(p.id))
      .map((p) => ({
        text: `payment of ${rupees(p.amount)} to ${p.recipientName || p.party?.name || "a payee"} is waiting for approval${p.creator?.name ? ` (from ${p.creator.name})` : ""}`,
        href: "/admin",
        ref: { type: "PAYMENT", id: p.id },
      })),
    ...orders
      .filter((o) => !done.has(o.id))
      .map((o) => ({
        text: `order ${o.orderNumber}${o.totalAmount ? ` for ${rupees(o.totalAmount)}` : ""} from ${o.vendor?.name || "a supplier"} is waiting for approval${o.creator?.name ? ` (from ${o.creator.name})` : ""}`,
        href: "/admin",
        ref: { type: "PURCHASE_ORDER", id: o.id },
      })),
  ];
}

/**
 * Sends what is waiting for each person. `userIds` limits it to some people
 * (right after an event); the scheduled run leaves it out.
 */
export async function sendStaffAlerts(organizationId: string, opts: { now?: Date; userIds?: string[] } = {}) {
  const now = opts.now ?? new Date();
  const s = await messagingSettings(organizationId);
  if (!s.staffAlerts || !channels(s).staff) return { sent: 0, failed: 0, held: 0, off: true };
  if (isQuietHour(now)) return { sent: 0, failed: 0, held: 0, off: false, quiet: true };

  const types = enabledTypes(s);
  const notes = await prisma.notification.findMany({
    where: {
      organizationId,
      whatsappAt: null,
      readAt: null,
      createdAt: { gte: new Date(now.getTime() - LOOK_BACK_MS) },
      ...(opts.userIds ? { userId: { in: opts.userIds } } : {}),
      OR: [{ type: { in: types } }, ...(s.staffSiteAlerts ? [{ severity: "CRITICAL" }] : [])],
    },
    select: { id: true, userId: true, title: true, message: true, href: true },
    orderBy: { createdAt: "asc" },
  });

  const userIds = new Set(notes.map((n) => n.userId));
  if (s.staffApprovals) {
    const admins = await prisma.user.findMany({
      where: { organizationId, status: "ACTIVE", role: { in: ADMIN_ROLES }, ...(opts.userIds ? { id: { in: opts.userIds } } : {}) },
      select: { id: true },
    });
    admins.forEach((a) => userIds.add(a.id));
  }
  if (userIds.size === 0) return { sent: 0, failed: 0, held: 0, off: false };

  const users = await prisma.user.findMany({ where: { id: { in: [...userIds] }, organizationId, status: "ACTIVE" }, select: { id: true, name: true, role: true, phone: true } });
  const base = siteBase(s);
  let sent = 0;
  let failed = 0;
  let held = 0;

  for (const u of users) {
    const to = indianMobile(u.phone);
    if (!to) continue;
    const items: Item[] = notes.filter((n) => n.userId === u.id).map((n) => ({ text: n.title || n.message, href: n.href || "/", notificationId: n.id }));
    if (s.staffApprovals && ADMIN_ROLES.includes(u.role)) items.push(...(await approvalItems(organizationId, to, now)));
    if (!items.length) continue;

    // One message every 15 minutes at most; the rest waits for the next one.
    const recent = await prisma.messageLog.findFirst({ where: { organizationId, to, kind: "STAFF", status: { in: ["SENT", "TEST"] }, createdAt: { gt: new Date(now.getTime() - GAP_MS) } }, select: { id: true } });
    if (recent) {
      held += items.length;
      continue;
    }

    const first = (u.name || "there").split(/\s+/)[0];
    const summary = summarise(items);
    const link = `${base}${items.length === 1 ? items[0].href : "/"}`;
    const refs = items.filter((i) => i.ref).map((i) => i.ref!);
    const r = await sendWhatsAppTemplate(organizationId, {
      to,
      template: s.waStaffTemplate,
      params: [oneLine(first, 60), summary, link],
      kind: "STAFF",
      text: `Hi ${first}, ${summary}. Open Bothra CMS: ${link}`,
      ref: refs[0],
    });
    // The other approvals in this message get a log row too, so they are not sent again.
    if (refs.length > 1) {
      await prisma.messageLog.createMany({
        data: refs.slice(1).map((ref) => ({ organizationId, channel: "WHATSAPP", provider: s.testMode ? "TEST" : "META", kind: "STAFF", to, text: `Hi ${first}, ${summary}. Open Bothra CMS: ${link}`, status: r.status, error: r.error?.slice(0, 500) || null, refType: ref.type, refId: ref.id })),
      });
    }
    const ids = items.filter((i) => i.notificationId).map((i) => i.notificationId!);
    if (ids.length) await prisma.notification.updateMany({ where: { id: { in: ids } }, data: { whatsappAt: now } });
    if (r.ok) sent++;
    else failed++;
  }
  return { sent, failed, held, off: false };
}

/** Each morning: everyone's overdue tasks, one message per person, once a day. */
export async function sendOverdueTaskDigest(organizationId: string, now = new Date()) {
  const s = await messagingSettings(organizationId);
  if (!s.staffAlerts || !s.staffTasks || !channels(s).staff) return { sent: 0, failed: 0, off: true };
  if (isQuietHour(now)) return { sent: 0, failed: 0, off: false };
  const tasks = await prisma.task.findMany({
    where: { organizationId, isArchived: false, assigneeUserId: { not: null }, dueAt: { lt: now }, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
    select: { title: true, dueAt: true, assigneeUserId: true, assignee: { select: { name: true, phone: true, status: true } } },
    orderBy: { dueAt: "asc" },
  });
  const byUser = new Map<string, typeof tasks>();
  for (const t of tasks) byUser.set(t.assigneeUserId!, [...(byUser.get(t.assigneeUserId!) || []), t]);

  const dayStart = istDayBounds(istDateKey(now)).start;
  const base = siteBase(s);
  let sent = 0;
  let failed = 0;
  for (const list of byUser.values()) {
    const who = list[0].assignee;
    const to = indianMobile(who?.phone);
    if (!to || who?.status !== "ACTIVE") continue;
    const already = await prisma.messageLog.findFirst({ where: { organizationId, to, kind: "STAFF_DIGEST", createdAt: { gte: dayStart } }, select: { id: true } });
    if (already) continue;
    const first = (who.name || "there").split(/\s+/)[0];
    const names = list.slice(0, 3).map((t) => `"${oneLine(t.title, 80)}"`).join(", ");
    const summary = oneLine(`you have ${list.length} overdue task${list.length === 1 ? "" : "s"}: ${names}${list.length > 3 ? ` and ${list.length - 3} more` : ""}`, 700);
    const link = `${base}/tasks`;
    const r = await sendWhatsAppTemplate(organizationId, { to, template: s.waStaffTemplate, params: [oneLine(first, 60), summary, link], kind: "STAFF_DIGEST", text: `Hi ${first}, ${summary}. Open Bothra CMS: ${link}` });
    if (r.ok) sent++;
    else failed++;
  }
  return { sent, failed, off: false };
}

/** Right after something happens in the app. Never fails the request that caused it. */
export async function alertStaffNow(organizationId: string, userIds?: string[]) {
  try {
    return await sendStaffAlerts(organizationId, { userIds });
  } catch (e) {
    console.error("[STAFF_ALERTS]", organizationId, e);
    return null;
  }
}

/** The scheduled run for every builder that has staff alerts on. */
export async function sendAllStaffAlerts(now = new Date()) {
  const orgs = await prisma.organization.findMany({ where: { status: "ACTIVE", settingsJson: { contains: '"staffAlerts":true' } }, select: { id: true } });
  const out: Record<string, { sent: number; failed: number; digest: number }> = {};
  for (const o of orgs) {
    try {
      const a = await sendStaffAlerts(o.id, { now });
      const d = await sendOverdueTaskDigest(o.id, now);
      out[o.id] = { sent: a.sent, failed: a.failed + d.failed, digest: d.sent };
    } catch (e) {
      console.error("[STAFF_ALERTS]", o.id, e);
    }
  }
  return out;
}
