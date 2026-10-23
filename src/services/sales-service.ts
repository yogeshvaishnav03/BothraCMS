import { prisma } from "@/lib/db";
import type { UserContext } from "@/lib/auth";
import { notifyPeople } from "@/lib/notify";
import { getUserAccessibleProjectIds, isOrgOwnerOrAdmin } from "@/lib/server-auth";
import { istDateKey } from "@/lib/ist-date";
import { randomBytes } from "crypto";
import { hasPermission } from "@/lib/permissions";
import { sendDemandMessages } from "@/services/demand-messages";
import { companyProfile } from "@/lib/company";

export { companyProfile };

/**
 * Sales: unit inventory per project, the lead pipeline, bookings and the
 * customer payment plan. Construction-linked instalments get a due date when
 * the office raises the demand (stage reached). Amounts in paise.
 */

export class SalesError extends Error {
  constructor(message: string, public statusCode = 422, public code = "SALES_INVALID") {
    super(message);
  }
}

export const LEAD_STAGES = ["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKED", "LOST"] as const;
export const LEAD_SOURCES = ["WALK_IN", "REFERRAL", "WEBSITE", "PORTAL", "NEWSPAPER", "SOCIAL", "BROKER", "OTHER"] as const;
export const UNIT_TYPES = ["1BHK", "2BHK", "3BHK", "4BHK", "VILLA", "PLOT", "SHOP", "OFFICE"] as const;

/** Payment plans, as % of the agreement value. `due` is days after booking; null = raised when the stage is reached. */
export const PAYMENT_PLANS: Record<string, { name: string; steps: { label: string; percent: number; due: number | null }[] }> = {
  CONSTRUCTION_LINKED: {
    name: "Construction linked",
    steps: [
      { label: "Booking amount", percent: 10, due: 0 },
      { label: "On agreement", percent: 10, due: 30 },
      { label: "On foundation", percent: 15, due: null },
      { label: "On plinth", percent: 10, due: null },
      { label: "On each slab (average)", percent: 25, due: null },
      { label: "On brickwork", percent: 10, due: null },
      { label: "On plaster and flooring", percent: 10, due: null },
      { label: "On possession", percent: 10, due: null },
    ],
  },
  DOWN_PAYMENT: {
    name: "Down payment",
    steps: [
      { label: "Booking amount", percent: 10, due: 0 },
      { label: "Within 45 days", percent: 80, due: 45 },
      { label: "On possession", percent: 10, due: null },
    ],
  },
};

/** GST usually charged on an under-construction unit, by unit type (%). The office can change it per booking. */
export const DEFAULT_GST: Record<string, number> = { SHOP: 12, OFFICE: 12, PLOT: 0 };
export const defaultGstFor = (unitType: string) => DEFAULT_GST[unitType] ?? 5;

/**
 * Which construction stage an instalment or a project stage belongs to, from
 * its name. "On plinth" and "Plinth beam & backfilling" both give "plinth".
 */
export function stageKey(name: string): string | null {
  const n = name.toLowerCase();
  if (/foundation|footing/.test(n)) return "foundation";
  if (/plinth/.test(n)) return "plinth";
  if (/slab|superstructure|roof/.test(n)) return "slab";
  if (/brick|block/.test(n)) return "brickwork";
  if (/plaster/.test(n)) return "plaster";
  if (/possession|handover/.test(n)) return "possession";
  return null;
}

const DEMAND_DAYS = 15;

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Projects the user can see sales for; null means all. Accounts staff see every project, to record receipts. */
async function scope(user: UserContext) {
  if (hasPermission(user.role, "finance:read")) return null;
  return getUserAccessibleProjectIds(user);
}

async function names(ids: (string | null | undefined)[]) {
  const clean = Array.from(new Set(ids.filter(Boolean) as string[]));
  const users = clean.length ? await prisma.user.findMany({ where: { id: { in: clean } }, select: { id: true, name: true } }) : [];
  return new Map(users.map((u) => [u.id, u.name]));
}

function audit(user: UserContext, action: string, entityType: string, entityId: string, after: unknown) {
  return prisma.auditEvent.create({
    data: { organizationId: user.organizationId, actorUserId: user.userId, action, entityType, entityId, afterJson: JSON.stringify(after) },
  });
}

async function nextReceiptNumber(organizationId: string, tx: any = prisma) {
  const prefix = `RC-${istDateKey().slice(2, 7).replace("-", "")}-`;
  const count = await tx.salesReceipt.count({ where: { organizationId, receiptNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

const due = (i: { amount: number; gstAmount: number }) => i.amount + i.gstAmount;

/** WhatsApp the demand letters at once when that is switched on. A failed send never stops the demand. */
async function sendDemandsNow(organizationId: string) {
  try {
    await sendDemandMessages(organizationId);
  } catch (e) {
    console.error("[WHATSAPP_DEMANDS]", e);
  }
}

/** Receipts saved as JSON before Phase 6, in the same shape as SalesReceipt rows. */
function legacyReceipts(inst: { id: string; receipts: string | null }) {
  if (!inst.receipts) return [];
  try {
    return (JSON.parse(inst.receipts) as any[]).map((r, i) => ({
      id: `legacy-${inst.id}-${i}`,
      receiptNumber: null as string | null,
      date: r.date,
      amount: r.amount,
      taxableAmount: r.amount,
      gstAmount: 0,
      mode: r.mode,
      reference: r.reference || null,
    }));
  } catch {
    return [];
  }
}

async function nextBookingNumber(organizationId: string) {
  const prefix = `BK-${istDateKey().slice(2, 7).replace("-", "")}-`;
  const count = await prisma.salesBooking.count({ where: { organizationId, bookingNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

export class SalesService {
  // ── Units ────────────────────────────────────────────────────────────────

  static async units(user: UserContext, projectId?: string | null) {
    const accessible = await scope(user);
    const where: any = { organizationId: user.organizationId };
    if (projectId) {
      if (accessible && !accessible.includes(projectId)) return [];
      where.projectId = projectId;
    } else if (accessible) where.projectId = { in: accessible };
    const rows = await prisma.salesUnit.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        bookings: { where: { status: "ACTIVE" }, select: { id: true, bookingNumber: true, customerName: true, agreementValue: true } },
      },
      orderBy: [{ projectId: "asc" }, { unitNumber: "asc" }],
    });
    return rows.map((u) => ({ ...u, booking: u.bookings[0] || null, bookings: undefined }));
  }

  /** Add one unit, or a run of them (e.g. prefix "A-", numbers 101 to 110). */
  static async addUnits(
    user: UserContext,
    input: { projectId: string; unitNumbers: string[]; unitType: string; floor?: string | null; areaSqft?: number | null; price: number }
  ) {
    const accessible = await scope(user);
    if (accessible && !accessible.includes(input.projectId)) throw new SalesError("You are not on this project's team.", 403, "PROJECT_ACCESS_DENIED");
    const project = await prisma.project.findFirst({ where: { id: input.projectId, organizationId: user.organizationId } });
    if (!project) throw new SalesError("Project not found", 404, "NOT_FOUND");
    const numbers = Array.from(new Set(input.unitNumbers.map((n) => n.trim().toUpperCase()).filter(Boolean)));
    if (numbers.length === 0) throw new SalesError("Enter at least one unit number.");
    const existing = await prisma.salesUnit.findMany({ where: { projectId: input.projectId, unitNumber: { in: numbers } }, select: { unitNumber: true } });
    if (existing.length) throw new SalesError(`Already added: ${existing.map((e) => e.unitNumber).join(", ")}`, 409, "UNIT_EXISTS");
    await prisma.salesUnit.createMany({
      data: numbers.map((unitNumber) => ({
        organizationId: user.organizationId,
        projectId: input.projectId,
        unitNumber,
        unitType: input.unitType,
        floor: input.floor || null,
        areaSqft: input.areaSqft || null,
        price: Math.round(input.price),
      })),
    });
    await audit(user, "SALES_UNITS_ADDED", "PROJECT", input.projectId, { count: numbers.length });
    return numbers.length;
  }

  static async updateUnit(user: UserContext, unitId: string, input: { price?: number; status?: "AVAILABLE" | "HOLD" }) {
    const unit = await prisma.salesUnit.findFirst({ where: { id: unitId, organizationId: user.organizationId } });
    if (!unit) throw new SalesError("Unit not found", 404, "NOT_FOUND");
    if (input.status && (unit.status === "BOOKED" || unit.status === "SOLD")) throw new SalesError("A booked unit cannot be put on hold or released here. Cancel the booking first.", 409, "UNIT_BOOKED");
    await prisma.salesUnit.update({ where: { id: unit.id }, data: { ...(input.price !== undefined ? { price: Math.round(input.price) } : {}), ...(input.status ? { status: input.status } : {}) } });
  }

  // ── Leads ────────────────────────────────────────────────────────────────

  static async leads(user: UserContext, filters: { stage?: string | null; q?: string | null }) {
    const where: any = { organizationId: user.organizationId };
    // Sales staff who are not admins see the leads assigned to them or that they added.
    if (!isOrgOwnerOrAdmin(user)) where.OR = [{ assignedTo: user.userId }, { createdBy: user.userId }, { assignedTo: null }];
    if (filters.stage) where.stage = filters.stage;
    if (filters.q) where.AND = [{ OR: [{ name: { contains: filters.q } }, { phone: { contains: filters.q } }] }];
    const rows = await prisma.salesLead.findMany({
      where,
      include: { activities: { orderBy: { createdAt: "desc" }, take: 20 } },
      orderBy: [{ nextFollowUp: "asc" }, { updatedAt: "desc" }],
      take: 300,
    });
    const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter(Boolean) as string[]));
    const [projects, people] = await Promise.all([
      prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
      names(rows.flatMap((r) => [r.assignedTo, r.createdBy, ...r.activities.map((a) => a.createdBy)])),
    ]);
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const today = istDateKey();
    const leads = rows.map((r) => ({
      ...r,
      projectName: r.projectId ? projectName.get(r.projectId) || null : null,
      assignedToName: r.assignedTo ? people.get(r.assignedTo) || null : null,
      followUpDue: !!r.nextFollowUp && r.nextFollowUp <= today && r.stage !== "BOOKED" && r.stage !== "LOST",
      activities: r.activities.map((a) => ({ ...a, byName: people.get(a.createdBy) || null })),
    }));
    const counts = Object.fromEntries(LEAD_STAGES.map((s) => [s, leads.filter((l) => l.stage === s).length]));
    return { leads, counts, followUpsDue: leads.filter((l) => l.followUpDue).length };
  }

  static async createLead(
    user: UserContext,
    input: { name: string; phone: string; email?: string | null; source: string; projectId?: string | null; interest?: string | null; budget?: number | null; nextFollowUp?: string | null; assignedTo?: string | null; note?: string | null }
  ) {
    const phone = input.phone.replace(/[^\d+]/g, "");
    const dup = await prisma.salesLead.findFirst({ where: { organizationId: user.organizationId, phone, stage: { notIn: ["BOOKED", "LOST"] } } });
    if (dup) throw new SalesError(`${dup.name} with this number is already in the pipeline.`, 409, "LEAD_EXISTS");
    const lead = await prisma.salesLead.create({
      data: {
        organizationId: user.organizationId,
        projectId: input.projectId || null,
        name: input.name.trim(),
        phone,
        email: input.email || null,
        source: input.source,
        interest: input.interest || null,
        budget: input.budget ? Math.round(input.budget) : null,
        nextFollowUp: input.nextFollowUp || null,
        assignedTo: input.assignedTo || user.userId,
        createdBy: user.userId,
        activities: { create: { kind: "NOTE", note: input.note?.trim() || `Lead added (${input.source.replace("_", " ").toLowerCase()})`, createdBy: user.userId } },
      },
    });
    if (lead.assignedTo && lead.assignedTo !== user.userId) {
      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: [lead.assignedTo],
        type: "SALES_LEAD",
        title: `New lead for you: ${lead.name}`,
        message: `${lead.interest || "Enquiry"} · ${lead.phone}`,
        href: `/sales?tab=leads&id=${lead.id}`,
        entityType: "SALES_LEAD",
        entityId: lead.id,
      });
    }
    return lead;
  }

  /** Log a call/visit/note, and optionally move the stage or set the next follow-up. */
  static async logActivity(
    user: UserContext,
    leadId: string,
    input: { kind: "CALL" | "WHATSAPP" | "SITE_VISIT" | "MEETING" | "NOTE"; note: string; stage?: string | null; nextFollowUp?: string | null; lostReason?: string | null }
  ) {
    const lead = await prisma.salesLead.findFirst({ where: { id: leadId, organizationId: user.organizationId } });
    if (!lead) throw new SalesError("Lead not found", 404, "NOT_FOUND");
    if (input.stage === "BOOKED") throw new SalesError("Make a booking on a unit to mark this lead booked.");
    if (input.stage === "LOST" && !input.lostReason?.trim()) throw new SalesError("Say why the lead was lost.");
    const data: any = {};
    if (input.stage && input.stage !== lead.stage) data.stage = input.stage;
    if (input.nextFollowUp !== undefined) data.nextFollowUp = input.nextFollowUp || null;
    if (input.stage === "LOST") data.lostReason = input.lostReason!.trim();
    const activities: any[] = [{ kind: input.kind, note: input.note.trim(), createdBy: user.userId }];
    if (data.stage) activities.push({ kind: "STAGE", note: `${lead.stage.replace("_", " ")} → ${data.stage.replace("_", " ")}`, createdBy: user.userId });
    await prisma.salesLead.update({ where: { id: lead.id }, data: { ...data, activities: { create: activities } } });
  }

  // ── Bookings and collections ─────────────────────────────────────────────

  static async book(
    user: UserContext,
    input: { unitId: string; leadId?: string | null; customerName?: string | null; customerPhone?: string | null; customerEmail?: string | null; bookingDate?: string | null; agreementValue: number; plan: string; gstRate?: number | null }
  ) {
    const plan = PAYMENT_PLANS[input.plan];
    if (!plan) throw new SalesError("Pick a payment plan.");
    const gstRate = input.gstRate ?? 0;
    if (gstRate < 0 || gstRate > 28) throw new SalesError("GST must be between 0% and 28%.");
    const unit = await prisma.salesUnit.findFirst({ where: { id: input.unitId, organizationId: user.organizationId }, include: { project: { select: { name: true } } } });
    if (!unit) throw new SalesError("Unit not found", 404, "NOT_FOUND");
    if (unit.status === "BOOKED" || unit.status === "SOLD") throw new SalesError(`${unit.unitNumber} is already booked.`, 409, "UNIT_BOOKED");
    const accessible = await scope(user);
    if (accessible && !accessible.includes(unit.projectId)) throw new SalesError("You are not on this project's team.", 403, "PROJECT_ACCESS_DENIED");

    const lead = input.leadId ? await prisma.salesLead.findFirst({ where: { id: input.leadId, organizationId: user.organizationId } }) : null;
    if (input.leadId && !lead) throw new SalesError("Lead not found", 404, "NOT_FOUND");
    const customerName = input.customerName?.trim() || lead?.name;
    const customerPhone = (input.customerPhone || lead?.phone || "").replace(/[^\d+]/g, "");
    if (!customerName || !customerPhone) throw new SalesError("Enter the customer's name and phone.");

    const bookingDate = input.bookingDate || istDateKey();
    const total = Math.round(input.agreementValue);
    // Split by plan %, with any rounding left-over on the last instalment.
    let allotted = 0;
    const installments = plan.steps.map((s, i) => {
      const amount = i === plan.steps.length - 1 ? total - allotted : Math.round((total * s.percent) / 100);
      allotted += amount;
      return {
        sortOrder: i,
        label: s.label,
        percent: s.percent,
        amount,
        gstAmount: Math.round((amount * gstRate) / 100),
        dueDate: s.due === null ? null : addDays(bookingDate, s.due),
        demandRaisedAt: s.due === null ? null : new Date(),
      };
    });

    const booking = await prisma.$transaction(async (tx) => {
      const booking = await tx.salesBooking.create({
        data: {
          organizationId: user.organizationId,
          unitId: unit.id,
          leadId: lead?.id || null,
          bookingNumber: await nextBookingNumber(user.organizationId),
          customerName,
          customerPhone,
          customerEmail: input.customerEmail || lead?.email || null,
          bookingDate,
          agreementValue: total,
          gstRate,
          createdBy: user.userId,
          installments: { create: installments },
        },
      });
      await tx.salesUnit.update({ where: { id: unit.id }, data: { status: "BOOKED" } });
      if (lead) {
        await tx.salesLead.update({
          where: { id: lead.id },
          data: { stage: "BOOKED", nextFollowUp: null, activities: { create: { kind: "STAGE", note: `Booked ${unit.unitNumber} (${booking.bookingNumber})`, createdBy: user.userId } } },
        });
      }
      return booking;
    });
    await audit(user, "SALES_BOOKED", "SALES_BOOKING", booking.id, { unit: unit.unitNumber, customerName, agreementValue: total });
    await SalesService.raiseForFinishedStages(booking.id, bookingDate);
    await notifyPeople({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      includeAdmins: true,
      type: "SALES_BOOKING",
      title: `${unit.unitNumber} booked by ${customerName}`,
      message: `${unit.project.name} · ${booking.bookingNumber}`,
      href: `/sales?tab=bookings&id=${booking.id}`,
      entityType: "SALES_BOOKING",
      entityId: booking.id,
    });
    return booking;
  }

  static async bookings(user: UserContext) {
    const accessible = await scope(user);
    const rows = await prisma.salesBooking.findMany({
      where: { organizationId: user.organizationId, ...(accessible ? { unit: { projectId: { in: accessible } } } : {}) },
      include: {
        unit: { include: { project: { select: { id: true, name: true } } } },
        installments: { orderBy: { sortOrder: "asc" }, include: { receiptRows: { orderBy: { date: "asc" } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    const projectIds = Array.from(new Set(rows.map((b) => b.unit.projectId)));
    const stages = await prisma.projectMilestone.findMany({
      where: { organizationId: user.organizationId, projectId: { in: projectIds } },
      select: { id: true, projectId: true, name: true, progressPercent: true, status: true },
      orderBy: { sortOrder: "asc" },
    });
    const today = istDateKey();
    const bookings = rows.map((b) => {
      const projectStages = stages.filter((m) => m.projectId === b.unit.projectId);
      const total = b.installments.reduce((s, i) => s + due(i), 0);
      const received = b.installments.reduce((s, i) => s + i.receivedAmount, 0);
      const overdueAmount = b.installments.filter((i) => i.dueDate && i.dueDate <= today).reduce((s, i) => s + Math.max(0, due(i) - i.receivedAmount), 0);
      const nextDue = b.installments.find((i) => i.receivedAmount < due(i) && i.dueDate && i.dueDate > today) || null;
      return {
        ...b,
        portalToken: undefined,
        hasPortal: !!b.portalToken,
        stages: projectStages.map((m) => ({ id: m.id, name: m.name, progressPercent: m.progressPercent })),
        installments: b.installments.map((i) => {
          const linked = i.milestoneId
            ? projectStages.find((m) => m.id === i.milestoneId) || null
            : stageKey(i.label)
              ? projectStages.find((m) => stageKey(m.name) === stageKey(i.label)) || null
              : null;
          return {
            ...i,
            receiptRows: undefined,
            total: due(i),
            receipts: [...legacyReceipts(i), ...i.receiptRows],
            linkedStage: linked ? { id: linked.id, name: linked.name, progressPercent: linked.progressPercent, explicit: !!i.milestoneId } : null,
            overdue: !!i.dueDate && i.dueDate < today && i.receivedAmount < due(i),
          };
        }),
        total,
        received,
        balance: total - received,
        overdueAmount: b.status === "ACTIVE" ? overdueAmount : 0,
        nextDue: nextDue ? { ...nextDue, total: due(nextDue), receiptRows: undefined } : null,
      };
    });
    const active = bookings.filter((b) => b.status === "ACTIVE");
    return {
      bookings,
      summary: {
        bookings: active.length,
        salesValue: active.reduce((s, b) => s + b.agreementValue, 0),
        received: active.reduce((s, b) => s + b.received, 0),
        overdue: active.reduce((s, b) => s + b.overdueAmount, 0),
        overdueCustomers: active.filter((b) => b.overdueAmount > 0).length,
      },
    };
  }

  /** Construction-linked: the stage is reached, so this instalment falls due. */
  static async raiseDemand(user: UserContext, installmentId: string, dueDate?: string | null) {
    const inst = await prisma.salesInstallment.findFirst({ where: { id: installmentId, booking: { organizationId: user.organizationId } }, include: { booking: true } });
    if (!inst) throw new SalesError("Instalment not found", 404, "NOT_FOUND");
    if (inst.dueDate) throw new SalesError("This instalment already has a due date.", 409, "ALREADY_DUE");
    const date = dueDate || addDays(istDateKey(), DEMAND_DAYS);
    await prisma.salesInstallment.update({ where: { id: inst.id }, data: { dueDate: date, demandRaisedAt: new Date(), demandAuto: false } });
    await audit(user, "SALES_DEMAND_RAISED", "SALES_BOOKING", inst.bookingId, { label: inst.label, amount: due(inst), dueDate: date });
    await sendDemandsNow(user.organizationId);
    return date;
  }

  /** Tie an instalment to a project stage (or back to matching by name with null). */
  static async linkStage(user: UserContext, installmentId: string, milestoneId: string | null) {
    const inst = await prisma.salesInstallment.findFirst({
      where: { id: installmentId, booking: { organizationId: user.organizationId } },
      include: { booking: { include: { unit: true } } },
    });
    if (!inst) throw new SalesError("Instalment not found", 404, "NOT_FOUND");
    if (milestoneId) {
      const m = await prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId: inst.booking.unit.projectId } });
      if (!m) throw new SalesError("Pick a stage of this unit's project.");
    }
    await prisma.salesInstallment.update({ where: { id: inst.id }, data: { milestoneId } });
  }

  /**
   * A project stage reached 100%: every booking in that project whose
   * instalment is linked to the stage gets its demand raised, due in 15 days.
   * Returns how many demands were raised.
   */
  static async autoRaiseForStage(organizationId: string, milestone: { id: string; projectId: string; name: string }, actorUserId: string) {
    const key = stageKey(milestone.name);
    const candidates = await prisma.salesInstallment.findMany({
      where: {
        dueDate: null,
        booking: { organizationId, status: "ACTIVE", unit: { projectId: milestone.projectId } },
        OR: [{ milestoneId: milestone.id }, { milestoneId: null }],
      },
      include: { booking: { include: { unit: true } } },
    });
    const hits = candidates.filter((i) => i.milestoneId === milestone.id || (!i.milestoneId && key && stageKey(i.label) === key));
    if (hits.length === 0) return 0;
    const dueDate = addDays(istDateKey(), DEMAND_DAYS);
    await prisma.salesInstallment.updateMany({ where: { id: { in: hits.map((h) => h.id) } }, data: { dueDate, demandRaisedAt: new Date(), demandAuto: true } });
    await prisma.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        action: "SALES_DEMAND_AUTO",
        entityType: "PROJECT_MILESTONE",
        entityId: milestone.id,
        afterJson: JSON.stringify({ stage: milestone.name, demands: hits.length, dueDate }),
      },
    });
    const amount = hits.reduce((s, h) => s + due(h), 0);
    await notifyPeople({
      organizationId,
      actorUserId,
      includeAdmins: true,
      userIds: Array.from(new Set(hits.map((h) => h.booking.createdBy))),
      type: "SALES_BOOKING",
      title: `${hits.length} customer demand${hits.length === 1 ? "" : "s"} raised: ${milestone.name} done`,
      message: `₹${(amount / 100).toLocaleString("en-IN")} due by ${dueDate}. Send the demand letters on WhatsApp from Sales → Bookings.`,
      href: "/sales?tab=bookings&demands=1",
      entityType: "PROJECT_MILESTONE",
      entityId: milestone.id,
    });
    await sendDemandsNow(organizationId);
    return hits.length;
  }

  /**
   * A buyer who books late owes the instalments for stages already finished:
   * those demands are raised at booking, due 15 days after the booking date.
   */
  static async raiseForFinishedStages(bookingId: string, bookingDate: string) {
    const booking = await prisma.salesBooking.findUnique({ where: { id: bookingId }, include: { unit: true, installments: true } });
    if (!booking) return 0;
    const done = await prisma.projectMilestone.findMany({ where: { projectId: booking.unit.projectId, status: "COMPLETED" }, select: { id: true, name: true } });
    const doneKeys = new Set(done.map((m) => stageKey(m.name)).filter(Boolean));
    const hits = booking.installments.filter((i) => !i.dueDate && (i.milestoneId ? done.some((m) => m.id === i.milestoneId) : doneKeys.has(stageKey(i.label))));
    if (hits.length === 0) return 0;
    await prisma.salesInstallment.updateMany({
      where: { id: { in: hits.map((h) => h.id) } },
      data: { dueDate: addDays(bookingDate, DEMAND_DAYS), demandRaisedAt: new Date(), demandAuto: true },
    });
    return hits.length;
  }

  /** Money received from the customer against an instalment. Returns the receipt. */
  static async receive(user: UserContext, installmentId: string, input: { amount: number; date?: string | null; mode: string; reference?: string | null }) {
    const inst = await prisma.salesInstallment.findFirst({ where: { id: installmentId, booking: { organizationId: user.organizationId } }, include: { booking: { include: { installments: true, unit: true } } } });
    if (!inst) throw new SalesError("Instalment not found", 404, "NOT_FOUND");
    if (inst.booking.status !== "ACTIVE") throw new SalesError("This booking is cancelled.", 409, "BOOKING_CANCELLED");
    const amount = Math.round(input.amount);
    if (amount <= 0) throw new SalesError("Enter the amount received.");
    const left = due(inst) - inst.receivedAmount;
    if (amount > left) throw new SalesError(`Only ₹${(left / 100).toLocaleString("en-IN")} is left on this instalment.`);
    const date = input.date || istDateKey();
    // Split what came in between the price and the GST in the instalment's own ratio.
    const gstAmount = inst.gstAmount ? Math.round((amount * inst.gstAmount) / due(inst)) : 0;
    const bookingTotal = inst.booking.installments.reduce((s, i) => s + due(i), 0);
    const receivedTotal = inst.booking.installments.reduce((s, i) => s + i.receivedAmount, 0) + amount;
    const receipt = await prisma.$transaction(async (tx) => {
      await tx.salesInstallment.update({
        where: { id: inst.id },
        data: { receivedAmount: inst.receivedAmount + amount, lastReceivedAt: new Date(), dueDate: inst.dueDate || date },
      });
      if (receivedTotal >= bookingTotal) await tx.salesUnit.update({ where: { id: inst.booking.unitId }, data: { status: "SOLD" } });
      return tx.salesReceipt.create({
        data: {
          organizationId: user.organizationId,
          bookingId: inst.bookingId,
          installmentId: inst.id,
          receiptNumber: await nextReceiptNumber(user.organizationId, tx),
          date,
          amount,
          taxableAmount: amount - gstAmount,
          gstAmount,
          mode: input.mode,
          reference: input.reference || null,
          createdBy: user.userId,
        },
      });
    });
    await audit(user, "SALES_RECEIPT", "SALES_BOOKING", inst.bookingId, { receipt: receipt.receiptNumber, label: inst.label, amount, mode: input.mode, reference: input.reference || null });
    return receipt;
  }

  /** Customer money received between two dates (inclusive), newest first. */
  static async moneyIn(organizationId: string, from: string, to: string) {
    const rows = await prisma.salesReceipt.findMany({
      where: { organizationId, date: { gte: from, lte: to }, cancelledAt: null, booking: { status: "ACTIVE" } },
      include: {
        booking: { select: { id: true, bookingNumber: true, customerName: true, customerPhone: true, gstRate: true, unit: { select: { unitNumber: true, unitType: true, project: { select: { id: true, name: true, siteId: true } } } } } },
        installment: { select: { label: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const people = await names(rows.map((r) => r.createdBy));
    return rows.map((r) => ({ ...r, byName: people.get(r.createdBy) || null }));
  }

  /** One receipt with everything a printed receipt needs. */
  static async receipt(organizationId: string, receiptId: string) {
    const r = await prisma.salesReceipt.findFirst({
      where: { id: receiptId, organizationId },
      include: { booking: { include: { unit: { include: { project: { select: { name: true } } } } } }, installment: true },
    });
    if (!r) return null;
    return { ...r, company: await companyProfile(organizationId), byName: (await names([r.createdBy])).get(r.createdBy) || null };
  }

  /** A demand letter for one instalment. */
  static async demand(organizationId: string, installmentId: string) {
    const inst = await prisma.salesInstallment.findFirst({
      where: { id: installmentId, booking: { organizationId } },
      include: { booking: { include: { unit: { include: { project: { select: { name: true } } } }, installments: { orderBy: { sortOrder: "asc" } } } } },
    });
    if (!inst) return null;
    const b = inst.booking;
    const earlierDue = b.installments
      .filter((i) => i.sortOrder < inst.sortOrder && i.dueDate)
      .reduce((s, i) => s + Math.max(0, due(i) - i.receivedAmount), 0);
    return {
      installment: { ...inst, booking: undefined, total: due(inst), balance: due(inst) - inst.receivedAmount },
      booking: { id: b.id, bookingNumber: b.bookingNumber, customerName: b.customerName, customerPhone: b.customerPhone, customerEmail: b.customerEmail, agreementValue: b.agreementValue, gstRate: b.gstRate, unit: b.unit },
      earlierDue,
      paidSoFar: b.installments.reduce((s, i) => s + i.receivedAmount, 0),
      company: await companyProfile(organizationId),
    };
  }

  // ── Buyer portal ─────────────────────────────────────────────────────────

  /** The buyer's secret portal link. `reset` makes a new one so the old link stops working. */
  static async portalLink(user: UserContext, bookingId: string, reset = false) {
    const booking = await prisma.salesBooking.findFirst({ where: { id: bookingId, organizationId: user.organizationId }, include: { unit: true } });
    if (!booking) throw new SalesError("Booking not found", 404, "NOT_FOUND");
    const accessible = await scope(user);
    if (accessible && !accessible.includes(booking.unit.projectId)) throw new SalesError("You are not on this project's team.", 403, "PROJECT_ACCESS_DENIED");
    if (booking.status !== "ACTIVE") throw new SalesError("This booking is cancelled.", 409, "BOOKING_CANCELLED");
    if (booking.portalToken && !reset) return booking.portalToken;
    const token = randomBytes(24).toString("base64url");
    await prisma.salesBooking.update({ where: { id: booking.id }, data: { portalToken: token } });
    await audit(user, reset ? "SALES_PORTAL_RESET" : "SALES_PORTAL_CREATED", "SALES_BOOKING", booking.id, { bookingNumber: booking.bookingNumber });
    return token;
  }

  /** What the buyer sees. Null when the link is wrong, reset or the booking is cancelled. */
  static async portalView(token: string) {
    if (!token || token.length < 20) return null;
    const b = await prisma.salesBooking.findUnique({
      where: { portalToken: token },
      include: {
        unit: { include: { project: { select: { id: true, name: true, startDate: true, endDate: true } } } },
        installments: { orderBy: { sortOrder: "asc" }, include: { receiptRows: { where: { cancelledAt: null }, orderBy: { date: "asc" } } } },
      },
    });
    if (!b || b.status !== "ACTIVE") return null;
    const [stages, company] = await Promise.all([
      prisma.projectMilestone.findMany({
        where: { projectId: b.unit.projectId },
        orderBy: { sortOrder: "asc" },
        include: { updates: { where: { photoUrls: { not: null } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, createdAt: true, note: true, photoUrls: true, progressTo: true } } },
      }),
      companyProfile(b.organizationId),
    ]);
    const today = istDateKey();
    const totalWeight = stages.reduce((s, m) => s + (m.weight > 0 ? m.weight : 0), 0);
    const progress = totalWeight ? Math.round(stages.reduce((s, m) => s + (m.weight > 0 ? m.weight : 0) * m.progressPercent, 0) / totalWeight) : null;
    const photos = stages
      .flatMap((m) =>
        m.updates.flatMap((u) => {
          let urls: string[] = [];
          try {
            urls = JSON.parse(u.photoUrls || "[]");
          } catch {
            urls = [];
          }
          return urls.map((_, n) => ({ updateId: u.id, n, stage: m.name, at: u.createdAt.toISOString(), note: u.note }));
        })
      )
      .sort((a, c) => (a.at < c.at ? 1 : -1))
      .slice(0, 12);
    const installments = b.installments.map((i) => ({
      id: i.id,
      label: i.label,
      amount: i.amount,
      gstAmount: i.gstAmount,
      total: due(i),
      dueDate: i.dueDate,
      receivedAmount: i.receivedAmount,
      overdue: !!i.dueDate && i.dueDate < today && i.receivedAmount < due(i),
      receipts: [...legacyReceipts(i), ...i.receiptRows].map((r) => ({ id: r.id, receiptNumber: r.receiptNumber, date: r.date, amount: r.amount, mode: r.mode })),
    }));
    const total = installments.reduce((s, i) => s + i.total, 0);
    const received = installments.reduce((s, i) => s + i.receivedAmount, 0);
    return {
      company,
      booking: { bookingNumber: b.bookingNumber, customerName: b.customerName, bookingDate: b.bookingDate, agreementValue: b.agreementValue, gstRate: b.gstRate },
      unit: { unitNumber: b.unit.unitNumber, unitType: b.unit.unitType, floor: b.unit.floor, areaSqft: b.unit.areaSqft },
      project: { name: b.unit.project.name, endDate: b.unit.project.endDate },
      installments,
      total,
      received,
      balance: total - received,
      dueNow: installments.filter((i) => i.dueDate && i.dueDate <= addDays(today, DEMAND_DAYS)).reduce((s, i) => s + Math.max(0, i.total - i.receivedAmount), 0),
      progress,
      stages: stages.map((m) => ({ name: m.name, progressPercent: m.progressPercent, status: m.status })),
      photos,
    };
  }

  /** A site photo for the portal, only if it belongs to this buyer's project. */
  static async portalPhotoUrl(token: string, updateId: string, n: number) {
    const b = await prisma.salesBooking.findUnique({ where: { portalToken: token }, include: { unit: true } });
    if (!b || b.status !== "ACTIVE") return null;
    const u = await prisma.projectMilestoneUpdate.findFirst({ where: { id: updateId, milestone: { projectId: b.unit.projectId } } });
    if (!u) return null;
    try {
      const urls = JSON.parse(u.photoUrls || "[]") as string[];
      return typeof urls[n] === "string" ? urls[n] : null;
    } catch {
      return null;
    }
  }

  /** A receipt the buyer can open from the portal. */
  static async portalReceipt(token: string, receiptId: string) {
    const b = await prisma.salesBooking.findUnique({ where: { portalToken: token }, select: { id: true, organizationId: true, status: true } });
    if (!b || b.status !== "ACTIVE") return null;
    const r = await prisma.salesReceipt.findFirst({ where: { id: receiptId, bookingId: b.id, cancelledAt: null }, select: { id: true } });
    return r ? SalesService.receipt(b.organizationId, r.id) : null;
  }

  /**
   * Takes back a receipt entered by mistake or a bounced cheque. The money
   * comes off the instalment, the receipt stays on record marked cancelled,
   * and its number is never reused.
   */
  static async cancelReceipt(user: UserContext, receiptId: string, reason: string) {
    if (!isOrgOwnerOrAdmin(user)) throw new SalesError("Only an admin can cancel a receipt.", 403, "FORBIDDEN");
    const why = reason.trim();
    if (why.length < 3) throw new SalesError("Say why the receipt is being cancelled.");
    const r = await prisma.salesReceipt.findFirst({ where: { id: receiptId, organizationId: user.organizationId }, include: { installment: true, booking: { include: { unit: true } } } });
    if (!r) throw new SalesError("Receipt not found", 404, "NOT_FOUND");
    if (r.cancelledAt) throw new SalesError("This receipt is already cancelled.", 409, "ALREADY_CANCELLED");
    if (r.booking.status !== "ACTIVE") throw new SalesError("This booking is cancelled.", 409, "BOOKING_CANCELLED");
    await prisma.$transaction(async (tx) => {
      await tx.salesInstallment.update({ where: { id: r.installmentId }, data: { receivedAmount: Math.max(0, r.installment.receivedAmount - r.amount) } });
      if (r.booking.unit.status === "SOLD") await tx.salesUnit.update({ where: { id: r.booking.unitId }, data: { status: "BOOKED" } });
      await tx.salesReceipt.update({ where: { id: r.id }, data: { cancelledAt: new Date(), cancelledBy: user.userId, cancelReason: why } });
    });
    await audit(user, "SALES_RECEIPT_CANCELLED", "SALES_BOOKING", r.bookingId, { receipt: r.receiptNumber, amount: r.amount, reason: why });
    return r.bookingId;
  }

  static async cancelBooking(user: UserContext, bookingId: string, reason: string) {
    if (!isOrgOwnerOrAdmin(user)) throw new SalesError("Only an admin can cancel a booking.", 403, "FORBIDDEN");
    const booking = await prisma.salesBooking.findFirst({ where: { id: bookingId, organizationId: user.organizationId } });
    if (!booking) throw new SalesError("Booking not found", 404, "NOT_FOUND");
    if (booking.status !== "ACTIVE") throw new SalesError("Already cancelled.", 409, "BOOKING_CANCELLED");
    await prisma.$transaction([
      prisma.salesBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", portalToken: null } }),
      prisma.salesUnit.update({ where: { id: booking.unitId }, data: { status: "AVAILABLE" } }),
    ]);
    await audit(user, "SALES_BOOKING_CANCELLED", "SALES_BOOKING", booking.id, { reason });
  }
}
