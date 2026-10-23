import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { companyProfile } from "@/lib/company";
import { istDateKey } from "@/lib/ist-date";
import { channels, messagingSettings, sendWhatsAppTemplate } from "@/lib/messaging";

/**
 * Demand letters and payment reminders on WhatsApp, sent without a click once
 * switched on in Settings → Messages:
 *
 * - DEMAND when an instalment falls due (the stage is reached),
 * - DUE_SOON a few days before the due date,
 * - OVERDUE every few days while it is unpaid, a limited number of times.
 *
 * Runs right after a demand is raised and once a day from the scheduler.
 * Each message is sent once: the message log is the record of what went out.
 */

const REF = "SALES_INSTALLMENT";
const MAX_FAILS = 3; // per instalment and kind, so a wrong number is not tried forever
const DEMAND_AHEAD = 15; // a demand goes out when the due date is this close (as when a stage raises it)

const due = (i: { amount: number; gstAmount: number }) => i.amount + i.gstAmount;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

export type DemandKind = "DEMAND" | "DUE_SOON" | "OVERDUE";

/** Which message, if any, this instalment needs today. */
export function nextMessage(
  inst: { dueDate: string | null; demandRaisedAt: Date | null },
  sent: { kind: string; status: string; createdAt: Date }[],
  today: string,
  rules: { remindBeforeDays: number; remindEveryDays: number; maxOverdueReminders: number }
): DemandKind | null {
  if (!inst.dueDate) return null;
  const good = sent.filter((m) => m.status !== "FAILED");
  const failedToo = (kind: string) => sent.filter((m) => m.kind === kind && m.status === "FAILED").length >= MAX_FAILS;
  const sentToday = good.some((m) => istDateKey(m.createdAt) === today);
  const left = days(today, inst.dueDate);
  if (left >= 0 && left <= DEMAND_AHEAD && !good.some((m) => m.kind === "DEMAND")) return failedToo("DEMAND") ? null : "DEMAND";
  if (sentToday) return null;
  if (left > 0) {
    if (rules.remindBeforeDays > 0 && left <= rules.remindBeforeDays && !good.some((m) => m.kind === "DUE_SOON") && !failedToo("DUE_SOON")) return "DUE_SOON";
    return null;
  }
  if (left < 0) {
    const overdue = good.filter((m) => m.kind === "OVERDUE");
    if (overdue.length >= rules.maxOverdueReminders || failedToo("OVERDUE")) return null;
    const last = overdue[overdue.length - 1];
    if (!last || days(istDateKey(last.createdAt), today) >= Math.max(1, rules.remindEveryDays)) return "OVERDUE";
  }
  return null;
}

/** Sends what is due today for one builder. Returns how many went out. */
export async function sendDemandMessages(organizationId: string, today = istDateKey()) {
  const s = await messagingSettings(organizationId);
  if (!s.autoDemands || !channels(s).demands) return { sent: 0, failed: 0, off: true };
  const company = await companyProfile(organizationId);
  const open = (
    await prisma.salesInstallment.findMany({
      where: { dueDate: { not: null }, booking: { organizationId, status: "ACTIVE" } },
      include: { booking: { include: { unit: { include: { project: { select: { name: true } } } } } } },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
    })
  ).filter((i) => i.receivedAmount < due(i));
  const logs = await prisma.messageLog.findMany({
    where: { organizationId, refType: REF, refId: { in: open.map((i) => i.id) } },
    orderBy: { createdAt: "asc" },
    select: { refId: true, kind: true, status: true, createdAt: true },
  });
  const base = (s.siteUrl || process.env.APP_URL || "").replace(/\/+$/, "");
  let sent = 0;
  let failed = 0;
  // One message per buyer per day: the most pressing kind, covering every
  // instalment of that kind, so a buyer is never sent a pile of messages.
  const RANK: Record<DemandKind, number> = { DEMAND: 0, OVERDUE: 1, DUE_SOON: 2 };
  const byBooking = new Map<string, { kind: DemandKind; insts: typeof open }>();
  const instBooking = new Map(open.map((i) => [i.id, i.bookingId]));
  const messagedToday = new Set(logs.filter((l) => l.status !== "FAILED" && istDateKey(l.createdAt) === today).map((l) => instBooking.get(l.refId!)));
  for (const inst of open) {
    if (messagedToday.has(inst.bookingId)) continue;
    const kind = nextMessage(inst, logs.filter((l) => l.refId === inst.id), today, s);
    if (!kind) continue;
    const cur = byBooking.get(inst.bookingId);
    if (!cur || RANK[kind] < RANK[cur.kind]) byBooking.set(inst.bookingId, { kind, insts: [inst] });
    else if (cur.kind === kind) cur.insts.push(inst);
  }
  for (const { kind, insts } of Array.from(byBooking.values())) {
    const b = insts[0].booking;
    let token = b.portalToken;
    if (!token) {
      token = randomBytes(24).toString("base64url");
      await prisma.salesBooking.update({ where: { id: b.id }, data: { portalToken: token } });
    }
    const name = b.customerName.split(" ")[0];
    const home = `Unit ${b.unit.unitNumber}, ${b.unit.project.name}`;
    const label = insts.length === 1 ? insts[0].label : insts.map((i) => i.label).join(", ");
    const amount = money(insts.reduce((sum, i) => sum + due(i) - i.receivedAmount, 0));
    const date = longDate(insts[0].dueDate!);
    const link = base ? `${base}/portal/${token}` : `Call ${company.phone || "the sales office"}`;
    const params = [name, home, label, amount, date, link];
    const what = insts.length === 1 ? `"${label}"` : `${insts.length} instalments (${label})`;
    const text =
      kind === "DEMAND"
        ? `Dear ${name}, the ${what} instalment${insts.length === 1 ? "" : "s"} for ${home} ${insts.length === 1 ? "is" : "are"} now due: ${amount} by ${date}. Your payment schedule and receipts: ${link}. ${company.name}`
        : kind === "DUE_SOON"
          ? `Dear ${name}, a reminder that ${amount} for ${what} (${home}) is due on ${date}. ${link}. ${company.name}`
          : `Dear ${name}, ${amount} for ${what} (${home}) was due ${insts.length === 1 ? "on" : "from"} ${date} and is not received yet. Please pay soon, or call us if you already have. ${link}. ${company.name}`;
    const template = kind === "DEMAND" ? s.waDemandTemplate : s.waReminderTemplate || s.waDemandTemplate;
    const r = await sendWhatsAppTemplate(organizationId, { to: b.customerPhone, template, params, kind, text, ref: { type: REF, id: insts[0].id } });
    // The same message counts for the other instalments it covered.
    if (insts.length > 1) {
      const row = await prisma.messageLog.findUniqueOrThrow({ where: { id: r.logId } });
      const { id: _id, createdAt: _at, refId: _ref, ...copy } = row;
      await prisma.messageLog.createMany({ data: insts.slice(1).map((i) => ({ ...copy, refId: i.id })) });
    }
    if (r.ok) sent++;
    else failed++;
  }
  return { sent, failed, off: false };
}

/** The daily run for every builder that has it switched on. */
export async function sendAllDemandMessages(today = istDateKey()) {
  const orgs = await prisma.organization.findMany({ where: { status: "ACTIVE", settingsJson: { contains: '"autoDemands":true' } }, select: { id: true } });
  const out: Record<string, { sent: number; failed: number }> = {};
  for (const o of orgs) {
    try {
      const r = await sendDemandMessages(o.id, today);
      out[o.id] = { sent: r.sent, failed: r.failed };
    } catch (e) {
      console.error("[WHATSAPP_DEMANDS]", o.id, e);
    }
  }
  return out;
}
