import { prisma } from "@/lib/db";
import type { UserContext } from "@/lib/auth";
import { notifyPeople } from "@/lib/notify";
import { getUserAccessibleProjectIds, isOrgOwnerOrAdmin } from "@/lib/server-auth";
import { istDateKey } from "@/lib/ist-date";

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

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function scope(user: UserContext) {
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
    input: { unitId: string; leadId?: string | null; customerName?: string | null; customerPhone?: string | null; customerEmail?: string | null; bookingDate?: string | null; agreementValue: number; plan: string }
  ) {
    const plan = PAYMENT_PLANS[input.plan];
    if (!plan) throw new SalesError("Pick a payment plan.");
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
      return { sortOrder: i, label: s.label, percent: s.percent, amount, dueDate: s.due === null ? null : addDays(bookingDate, s.due) };
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
      include: { unit: { include: { project: { select: { id: true, name: true } } } }, installments: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    const today = istDateKey();
    const bookings = rows.map((b) => {
      const received = b.installments.reduce((s, i) => s + i.receivedAmount, 0);
      const due = b.installments.filter((i) => i.dueDate && i.dueDate <= today).reduce((s, i) => s + Math.max(0, i.amount - i.receivedAmount), 0);
      const nextDue = b.installments.find((i) => i.receivedAmount < i.amount && i.dueDate && i.dueDate > today) || null;
      return {
        ...b,
        installments: b.installments.map((i) => ({
          ...i,
          receipts: i.receipts ? JSON.parse(i.receipts) : [],
          overdue: !!i.dueDate && i.dueDate < today && i.receivedAmount < i.amount,
        })),
        received,
        balance: b.agreementValue - received,
        overdueAmount: b.status === "ACTIVE" ? due : 0,
        nextDue,
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
    const date = dueDate || addDays(istDateKey(), 15);
    await prisma.salesInstallment.update({ where: { id: inst.id }, data: { dueDate: date } });
    await audit(user, "SALES_DEMAND_RAISED", "SALES_BOOKING", inst.bookingId, { label: inst.label, amount: inst.amount, dueDate: date });
    return date;
  }

  /** Money received from the customer against an instalment. */
  static async receive(user: UserContext, installmentId: string, input: { amount: number; date?: string | null; mode: string; reference?: string | null }) {
    const inst = await prisma.salesInstallment.findFirst({ where: { id: installmentId, booking: { organizationId: user.organizationId } }, include: { booking: { include: { installments: true, unit: true } } } });
    if (!inst) throw new SalesError("Instalment not found", 404, "NOT_FOUND");
    if (inst.booking.status !== "ACTIVE") throw new SalesError("This booking is cancelled.", 409, "BOOKING_CANCELLED");
    const amount = Math.round(input.amount);
    const left = inst.amount - inst.receivedAmount;
    if (amount > left) throw new SalesError(`Only ₹${(left / 100).toLocaleString("en-IN")} is left on this instalment.`);
    const receipts = inst.receipts ? JSON.parse(inst.receipts) : [];
    receipts.push({ amount, date: input.date || istDateKey(), mode: input.mode, reference: input.reference || null, by: user.userId });
    const receivedTotal = inst.booking.installments.reduce((s, i) => s + i.receivedAmount, 0) + amount;
    await prisma.$transaction([
      prisma.salesInstallment.update({
        where: { id: inst.id },
        data: { receivedAmount: inst.receivedAmount + amount, lastReceivedAt: new Date(), receipts: JSON.stringify(receipts), dueDate: inst.dueDate || input.date || istDateKey() },
      }),
      ...(receivedTotal >= inst.booking.agreementValue ? [prisma.salesUnit.update({ where: { id: inst.booking.unitId }, data: { status: "SOLD" } })] : []),
    ]);
    await audit(user, "SALES_RECEIPT", "SALES_BOOKING", inst.bookingId, { label: inst.label, amount, mode: input.mode, reference: input.reference || null });
  }

  static async cancelBooking(user: UserContext, bookingId: string, reason: string) {
    if (!isOrgOwnerOrAdmin(user)) throw new SalesError("Only an admin can cancel a booking.", 403, "FORBIDDEN");
    const booking = await prisma.salesBooking.findFirst({ where: { id: bookingId, organizationId: user.organizationId } });
    if (!booking) throw new SalesError("Booking not found", 404, "NOT_FOUND");
    if (booking.status !== "ACTIVE") throw new SalesError("Already cancelled.", 409, "BOOKING_CANCELLED");
    await prisma.$transaction([
      prisma.salesBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } }),
      prisma.salesUnit.update({ where: { id: booking.unitId }, data: { status: "AVAILABLE" } }),
    ]);
    await audit(user, "SALES_BOOKING_CANCELLED", "SALES_BOOKING", booking.id, { reason });
  }
}
