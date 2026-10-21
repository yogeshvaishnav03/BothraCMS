import { prisma } from "@/lib/db";
import { roundPaise } from "@/lib/financial-math";
import { fetchDayBookData } from "@/services/day-book-service";

/**
 * Admin Command Center: one call that answers "what happened in the company
 * on this date" — the Day Book merged into a single timeline, money in/out,
 * approvals waiting, a 7-day cash trend, who did what, and the audit feed.
 */

export type TimelineKind =
  | "PAYMENT"
  | "BILL"
  | "RECEIPT"
  | "ISSUE"
  | "ATTENDANCE"
  | "HEADCOUNT"
  | "SITE_REPORT";

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  detail: string;
  amount?: number;
  actor?: string;
  href: string;
}

function iso(val: Date | string | null | undefined): string {
  if (!val) return new Date(0).toISOString();
  const d = typeof val === "string" ? new Date(val) : val;
  return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function istDateKey(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export class CommandCenterService {
  static async getOverview(organizationId: string, date: string, siteId?: string) {
    const dayBook = await fetchDayBookData(organizationId, date, siteId);

    // ── 1. Day Book as one timeline, newest first ──────────────────────────
    const timeline: TimelineEntry[] = [];

    for (const p of dayBook.payments as any[]) {
      timeline.push({
        id: `pay-${p.id}`,
        kind: "PAYMENT",
        at: iso(p.createdAt || p.paymentDate),
        title: `Paid ${p.party?.name || p.recipientName || "payee"}`,
        detail: [p.method, p.referenceNumber, p.project?.name, p.status === "PENDING_APPROVAL" ? "awaiting approval" : null]
          .filter(Boolean)
          .join(" · "),
        amount: p.amount,
        actor: p.creator?.name,
        href: "/finance",
      });
    }
    for (const b of dayBook.bills as any[]) {
      timeline.push({
        id: `bill-${b.id}`,
        kind: "BILL",
        at: iso(b.createdAt || b.billDate),
        title: `Bill ${b.billNumber} from ${b.party?.name || "party"}`,
        detail: b.project?.name || "General",
        amount: b.totalAmount,
        href: "/finance",
      });
    }
    for (const m of dayBook.receipts as any[]) {
      timeline.push({
        id: `rcpt-${m.id}`,
        kind: "RECEIPT",
        at: iso(m.movementAt || m.createdAt),
        title: `Received ${Math.abs(m.quantityDelta ?? 0)} ${m.material?.unitCode || ""} ${m.material?.name || "material"}`.replace(/\s+/g, " "),
        detail: m.store?.name || "Store",
        actor: m.creator?.name,
        href: m.material?.id ? `/materials/${m.material.id}` : "/materials",
      });
    }
    for (const m of dayBook.issues as any[]) {
      timeline.push({
        id: `iss-${m.id}`,
        kind: "ISSUE",
        at: iso(m.movementAt || m.createdAt),
        title: `Issued ${Math.abs(m.quantityDelta ?? 0)} ${m.material?.unitCode || ""} ${m.material?.name || "material"}`.replace(/\s+/g, " "),
        detail: m.store?.name || "Store",
        actor: m.creator?.name,
        href: m.material?.id ? `/materials/${m.material.id}` : "/materials",
      });
    }
    for (const a of dayBook.attendance as any[]) {
      timeline.push({
        id: `att-${a.id}`,
        kind: "ATTENDANCE",
        at: iso(a.checkInAt),
        title: `${a.workforceMember?.name || "Worker"} checked in`,
        detail: [a.site?.name, a.checkOutAt ? "checked out" : "on site"].filter(Boolean).join(" · "),
        href: "/attendance",
      });
    }
    for (const h of dayBook.headcount as any[]) {
      timeline.push({
        id: `hc-${h.id}`,
        kind: "HEADCOUNT",
        at: iso(h.createdAt),
        title: `${h.grandTotal || 0} labour on ${h.siteName || "site"}`,
        detail: [h.contractorName, h.shift].filter(Boolean).join(" · "),
        actor: h.supervisorName || undefined,
        href: "/workforce",
      });
    }
    for (const r of dayBook.dailyReports as any[]) {
      timeline.push({
        id: `rep-${r.id}`,
        kind: "SITE_REPORT",
        at: iso(r.createdAt),
        title: `Site report: ${r.project?.name || "project"}`,
        detail: r.blockers ? `${r.progress} · Blocker: ${r.blockers}` : r.progress,
        actor: r.creator?.name,
        href: "/day-book",
      });
    }
    timeline.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    // ── 2. Approvals waiting on the admin ──────────────────────────────────
    const [pendingPayments, pendingOrders] = await Promise.all([
      prisma.payment.findMany({
        where: { organizationId, status: "PENDING_APPROVAL", isArchived: false },
        select: { amount: true },
      }),
      prisma.purchaseOrder.count({ where: { organizationId, status: "PENDING_APPROVAL" } }),
    ]);

    // ── 3. Outstanding payables (bills − posted allocations) ──────────────
    const postedBills = await prisma.bill.findMany({
      where: { organizationId, status: "POSTED", isArchived: false },
      select: {
        totalAmount: true,
        allocations: {
          where: { reversedAt: null, payment: { status: "POSTED" } },
          select: { amount: true },
        },
      },
    });
    let outstandingPayables = 0;
    for (const b of postedBills) {
      const paid = b.allocations.reduce((s, a) => s + (a.amount ?? 0), 0);
      const remaining = roundPaise(b.totalAmount - paid);
      if (remaining > 0) outstandingPayables = roundPaise(outstandingPayables + remaining);
    }

    // ── 4. Seven-day cash trend ending on `date` ───────────────────────────
    const trendStart = shiftDate(date, -6);
    const rangeStart = new Date(`${trendStart}T00:00:00.000Z`);
    rangeStart.setTime(rangeStart.getTime() - 6 * 3600 * 1000);
    const rangeEnd = new Date(`${date}T23:59:59.999Z`);
    const [trendPayments, trendBills] = await Promise.all([
      prisma.payment.findMany({
        where: {
          organizationId,
          status: "POSTED",
          isArchived: false,
          paymentDate: { gte: rangeStart, lte: rangeEnd },
        },
        select: { amount: true, paymentDate: true },
      }),
      prisma.bill.findMany({
        where: { organizationId, isArchived: false, billDate: { gte: rangeStart, lte: rangeEnd } },
        select: { totalAmount: true, billDate: true },
      }),
    ]);
    const trend = Array.from({ length: 7 }, (_, i) => ({ date: shiftDate(trendStart, i), paid: 0, billed: 0 }));
    const byDate = new Map(trend.map((t) => [t.date, t]));
    for (const p of trendPayments) {
      const slot = byDate.get(istDateKey(p.paymentDate));
      if (slot) slot.paid = roundPaise(slot.paid + p.amount);
    }
    for (const b of trendBills) {
      const slot = byDate.get(istDateKey(b.billDate));
      if (slot) slot.billed = roundPaise(slot.billed + b.totalAmount);
    }

    // ── 5. Who did what on this date (audit trail + task updates) ──────────
    const dayStart = new Date(`${date}T00:00:00.000+05:30`);
    const dayEnd = new Date(`${date}T23:59:59.999+05:30`);
    const [auditEvents, taskUpdates] = await Promise.all([
      prisma.auditEvent.findMany({
        where: { organizationId, createdAt: { gte: dayStart, lte: dayEnd } },
        include: { actor: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.taskStatusHistory.findMany({
        where: { createdAt: { gte: dayStart, lte: dayEnd }, task: { organizationId } },
        include: {
          user: { select: { id: true, name: true, role: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    const team = new Map<
      string,
      { userId: string; name: string; role: string; actions: number; taskUpdates: number; lastActiveAt: string }
    >();
    const touch = (u: { id: string; name: string; role: string }, at: Date, isTask: boolean) => {
      const row =
        team.get(u.id) ||
        { userId: u.id, name: u.name, role: u.role, actions: 0, taskUpdates: 0, lastActiveAt: at.toISOString() };
      if (isTask) row.taskUpdates += 1;
      else row.actions += 1;
      if (at.toISOString() > row.lastActiveAt) row.lastActiveAt = at.toISOString();
      team.set(u.id, row);
    };
    auditEvents.forEach((e) => e.actor && touch(e.actor, e.createdAt, false));
    taskUpdates.forEach((h) => h.user && touch(h.user, h.createdAt, true));

    const activity = [
      ...auditEvents.slice(0, 25).map((e) => ({
        id: `audit-${e.id}`,
        at: e.createdAt.toISOString(),
        actor: e.actor?.name || "System",
        action: e.action,
        entityType: e.entityType,
        reason: e.reason,
      })),
      ...taskUpdates.slice(0, 25).map((h) => ({
        id: `task-${h.id}`,
        at: h.createdAt.toISOString(),
        actor: h.user?.name || "Someone",
        action: `TASK_${h.newStatus}`,
        entityType: "TASK",
        reason: h.task?.title || h.note || null,
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 25);

    return {
      date,
      summary: dayBook.summary,
      timeline: timeline.slice(0, 80),
      timelineTotal: timeline.length,
      approvals: {
        paymentsPendingCount: pendingPayments.length,
        paymentsPendingAmount: roundPaise(pendingPayments.reduce((s, p) => s + p.amount, 0)),
        ordersPendingCount: pendingOrders,
      },
      finance: {
        outstandingPayables,
        trend,
      },
      team: Array.from(team.values()).sort((a, b) => b.actions + b.taskUpdates - (a.actions + a.taskUpdates)),
      activity,
      recentActivityDates: dayBook.recentActivityDates,
    };
  }
}
