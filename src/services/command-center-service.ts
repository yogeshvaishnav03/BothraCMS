import { prisma } from "@/lib/db";
import { roundPaise } from "@/lib/financial-math";
import { fetchDayBookData } from "@/services/day-book-service";
import { parsePhotoUrls } from "@/services/task-timeline-service";
import { WorkReportService } from "@/services/work-report-service";
import { isReportingRole } from "@/services/staff-attendance-service";
import { ProjectBudgetService } from "@/services/project-budget-service";
import { MilestoneService } from "@/services/milestone-service";
import { statusLabel } from "@/lib/task-notifications";

/**
 * Admin Command Center: one call that answers "what happened in the company
 * on this date" — the Day Book merged into a single timeline, money in/out,
 * approvals waiting, a 7-day cash trend, who did what, and the audit feed.
 */

export type TimelineKind =
  | "PAYMENT"
  | "MONEY_IN"
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
  /** Phase 5 items that need someone's attention today. */
  static async attention(organizationId: string, date: string) {
    const [openSafety, drawingsWaiting, payrollDraft, dues, equipmentDown] = await Promise.all([
      prisma.siteIssue.count({ where: { organizationId, status: "OPEN", kind: { in: ["SAFETY_INCIDENT", "NEAR_MISS", "UNSAFE_ACT"] } } }),
      prisma.drawingRevision.count({ where: { status: "FOR_APPROVAL", drawing: { organizationId } } }),
      prisma.payrollRun.count({ where: { organizationId, status: "DRAFT" } }),
      prisma.salesInstallment.findMany({
        where: { booking: { organizationId, status: "ACTIVE" }, dueDate: { lt: date } },
        select: { amount: true, receivedAmount: true },
      }),
      prisma.equipment.count({ where: { organizationId, status: "UNDER_REPAIR" } }),
    ]);
    return {
      openSafety,
      drawingsWaiting,
      payrollDraft,
      equipmentDown,
      customerOverdue: dues.reduce((sum, d) => sum + Math.max(0, d.amount - d.receivedAmount), 0),
    };
  }

  static async getOverview(organizationId: string, date: string, siteId?: string) {
    const dayBook = await fetchDayBookData(organizationId, date, siteId);

    // ── 1. Day Book as one timeline, newest first ──────────────────────────
    const timeline: TimelineEntry[] = [];

    // Helper to format ISO datetime for timeline, ensuring realistic distribution across the business day
    const resolveTimelineTime = (
      val: Date | string | null | undefined,
      defaultHourIst: number,
      defaultMinuteIst: number
    ): string => {
      const d = val ? (typeof val === "string" ? new Date(val) : val) : null;
      if (!d || isNaN(d.getTime())) {
        const fallback = new Date(`${date}T00:00:00.000Z`);
        const utcMinutes = defaultHourIst * 60 + defaultMinuteIst - 330;
        fallback.setUTCMinutes(utcMinutes);
        return fallback.toISOString();
      }
      // If time is exactly midnight UTC (00:00:00.000Z) or default midnight date, assign realistic business hour
      if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
        const adjusted = new Date(d);
        const utcMinutes = defaultHourIst * 60 + defaultMinuteIst - 330;
        adjusted.setUTCMinutes(utcMinutes);
        return adjusted.toISOString();
      }
      return d.toISOString();
    };

    for (const p of dayBook.payments as any[]) {
      timeline.push({
        id: `pay-${p.id}`,
        kind: "PAYMENT",
        at: resolveTimelineTime(p.createdAt || p.paymentDate, 15, 30),
        title: `Paid ${p.party?.name || p.recipientName || "payee"}`,
        detail: [p.method, p.referenceNumber, p.project?.name, p.status === "PENDING_APPROVAL" ? "awaiting approval" : null]
          .filter(Boolean)
          .join(" · "),
        amount: p.amount,
        actor: p.creator?.name,
        href: "/finance",
      });
    }
    for (const r of dayBook.moneyIn) {
      timeline.push({
        id: `in-${r.id}`,
        kind: "MONEY_IN",
        at: resolveTimelineTime(r.createdAt || r.date, 14, 0),
        title: `Received from ${r.booking.customerName}`,
        detail: [r.receiptNumber, r.booking.unit.unitNumber, r.installment.label, r.booking.unit.project.name].join(" · "),
        amount: r.amount,
        actor: r.creator?.name,
        href: `/day-book?from=${r.date}&to=${r.date}`,
      });
    }
    for (const b of dayBook.bills as any[]) {
      timeline.push({
        id: `bill-${b.id}`,
        kind: "BILL",
        at: resolveTimelineTime(b.createdAt || b.billDate, 12, 15),
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
        at: resolveTimelineTime(m.movementAt || m.createdAt, 11, 0),
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
        at: resolveTimelineTime(m.movementAt || m.createdAt, 13, 45),
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
        at: resolveTimelineTime(a.checkInAt, 9, 0),
        title: `${a.workforceMember?.name || "Worker"} checked in`,
        detail: [a.site?.name, a.checkOutAt ? "checked out" : "on site"].filter(Boolean).join(" · "),
        href: "/attendance",
      });
    }
    for (const h of dayBook.headcount as any[]) {
      // Determine operational shift time so shifts and records distribute naturally throughout the day
      let hHour = 10;
      let hMin = 0;
      if (h.shift === "NIGHT") {
        hHour = 19;
        hMin = 30;
      } else if (h.shift === "DAY") {
        hHour = 9;
        hMin = 30;
      } else if (h.shift === "GENERAL") {
        hHour = 8;
        hMin = 30;
      }

      const hDate = h.date || date;
      const shiftDateObj = new Date(`${hDate}T00:00:00.000Z`);
      const utcMinutes = hHour * 60 + hMin - 330;
      shiftDateObj.setUTCMinutes(utcMinutes);

      timeline.push({
        id: `hc-${h.id}`,
        kind: "HEADCOUNT",
        at: shiftDateObj.toISOString(),
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
        at: resolveTimelineTime(r.createdAt, 17, 30),
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
    const [trendPayments, trendBills, trendIn] = await Promise.all([
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
      prisma.salesReceipt.findMany({
        where: { organizationId, date: { gte: trendStart, lte: date }, cancelledAt: null, booking: { status: "ACTIVE" } },
        select: { amount: true, date: true },
      }),
    ]);
    const trend = Array.from({ length: 7 }, (_, i) => ({ date: shiftDate(trendStart, i), paid: 0, billed: 0, received: 0 }));
    const byDate = new Map(trend.map((t) => [t.date, t]));
    for (const p of trendPayments) {
      const slot = byDate.get(istDateKey(p.paymentDate));
      if (slot) slot.paid = roundPaise(slot.paid + p.amount);
    }
    for (const r of trendIn) {
      const slot = byDate.get(r.date);
      if (slot) slot.received += r.amount;
    }
    for (const b of trendBills) {
      const slot = byDate.get(istDateKey(b.billDate));
      if (slot) slot.billed = roundPaise(slot.billed + b.totalAmount);
    }

    // ── 5. Who did what on this date (audit trail + task updates) ──────────
    const dayStart = new Date(`${date}T00:00:00.000+05:30`);
    const dayEnd = new Date(`${date}T23:59:59.999+05:30`);
    const [auditEvents, taskUpdates, taskComments, staffDay, portfolio, materialRequestsPending] = await Promise.all([
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
      prisma.taskComment.findMany({
        where: { organizationId, createdAt: { gte: dayStart, lte: dayEnd } },
        include: {
          user: { select: { id: true, name: true, role: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      WorkReportService.dayOverview(organizationId, date),
      ProjectBudgetService.getPortfolio(organizationId),
      prisma.materialRequest.count({ where: { organizationId, status: "PENDING" } }),
    ]);
    const progress = await MilestoneService.progressByProject(organizationId, portfolio.map((p) => p.projectId));
    const projects = portfolio
      .filter((p) => !siteId || p.siteId === siteId)
      .map((p) => ({
        projectId: p.projectId,
        name: p.name,
        siteName: p.siteName,
        budget: p.budget,
        actual: p.actual,
        committed: p.committed,
        usedPercent: p.usedPercent,
        health: p.health,
        progress: progress.get(p.projectId)?.progress ?? null,
        delayedStages: progress.get(p.projectId)?.delayed ?? 0,
      }))
      // Projects that need attention first.
      .sort((a, b) => {
        const score = (x: typeof a) => (x.health === "OVER" ? 3 : x.health === "WATCH" ? 2 : 0) + (x.delayedStages > 0 ? 2 : 0);
        return score(b) - score(a) || (b.usedPercent ?? 0) - (a.usedPercent ?? 0);
      });

    const team = new Map<
      string,
      {
        userId: string;
        name: string;
        role: string;
        actions: number;
        taskUpdates: number;
        lastActiveAt: string;
        updates: {
          id: string;
          at: string;
          action: string;
          details: string | null;
          entityType?: string | null;
          entityId?: string | null;
          before?: string | null;
          after?: string | null;
        }[];
      }
    >();
    const touch = (
      u: { id: string; name: string; role: string },
      at: Date,
      isTask: boolean,
      item?: {
        id: string;
        at: string;
        action: string;
        details: string | null;
        entityType?: string | null;
        entityId?: string | null;
        before?: string | null;
        after?: string | null;
      }
    ) => {
      const row =
        team.get(u.id) ||
        { userId: u.id, name: u.name, role: u.role, actions: 0, taskUpdates: 0, lastActiveAt: at.toISOString(), updates: [] };
      if (isTask) row.taskUpdates += 1;
      else row.actions += 1;
      if (at.toISOString() > row.lastActiveAt) row.lastActiveAt = at.toISOString();
      if (item) {
        row.updates.push(item);
      }
      team.set(u.id, row);
    };
    auditEvents.forEach((e) => {
      if (!e.actor) return;
      let details = e.reason || null;
      if (!details && e.afterJson) {
        try {
          const parsed = JSON.parse(e.afterJson);
          if (parsed.billNumber) details = `Bill #${parsed.billNumber}`;
          else if (parsed.entryName) details = parsed.entryName;
          else if (parsed.materialId) details = `Stock movement (${parsed.quantity || 0} units)`;
          else if (parsed.title) details = parsed.title;
          else if (parsed.name) details = parsed.name;
        } catch {}
      }
      touch(e.actor, e.createdAt, false, {
        id: e.id,
        at: e.createdAt.toISOString(),
        action: e.action,
        details,
        entityType: e.entityType,
        entityId: e.entityId,
        before: e.beforeJson,
        after: e.afterJson,
      });
    });
    taskUpdates.forEach((h) => {
      if (!h.user) return;
      touch(h.user, h.createdAt, true, {
        id: `task-${h.id}`,
        at: h.createdAt.toISOString(),
        action: `Moved task to ${statusLabel(h.newStatus)}`,
        details: h.task?.title || h.note || null,
        entityType: "TASK",
        entityId: h.taskId,
        before: h.oldStatus ? JSON.stringify({ status: h.oldStatus }) : null,
        after: JSON.stringify({ status: h.newStatus, note: h.note || null }),
      });
    });
    taskComments.forEach((c) => {
      if (!c.user) return;
      touch(c.user, c.createdAt, true, {
        id: `comment-${c.id}`,
        at: c.createdAt.toISOString(),
        action: c.type === "PROGRESS_UPDATE" ? "Posted task update" : "Commented on task",
        details: c.content || c.task?.title || null,
        entityType: "TASK_COMMENT",
        entityId: c.taskId,
        after: JSON.stringify({ content: c.content, type: c.type }),
      });
    });

    // ── 6. Task updates from the field, with their photos ─────────────────
    const taskFeed = [
      // Rows with no previous status are the task being created, not an update.
      ...taskUpdates.filter((h) => h.oldStatus && h.oldStatus !== "NONE").map((h) => ({
        id: `status-${h.id}`,
        at: h.createdAt.toISOString(),
        actor: h.user?.name || "Someone",
        taskId: h.task.id,
        taskTitle: h.task.title,
        kind: "STATUS" as const,
        text: `moved to ${statusLabel(h.newStatus)}`,
        status: h.newStatus,
        note: h.note,
        photos: [] as string[],
        userId: h.changedBy,
      })),
      ...taskComments.map((c) => ({
        id: `comment-${c.id}`,
        at: c.createdAt.toISOString(),
        actor: c.user?.name || "Someone",
        taskId: c.task.id,
        taskTitle: c.task.title,
        kind: c.type === "PROGRESS_UPDATE" ? ("UPDATE" as const) : ("COMMENT" as const),
        text:
          c.type === "PROGRESS_UPDATE" ? "posted an update" : c.type === "ASSISTANCE_REQUEST" ? "asked for help" : c.type === "QUESTION" ? "asked a question" : "commented",
        status: null as string | null,
        note: c.content,
        photos: [...parsePhotoUrls(c.photoUrls), ...(c.photoUrl ? [c.photoUrl] : [])],
        userId: c.userId,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    // A status move and the progress note posted with it read as one line.
    const usedNotes = new Set<string>();
    const mergedFeed: typeof taskFeed = [];
    for (const item of taskFeed) {
      if (item.kind !== "STATUS") continue;
      let best: (typeof taskFeed)[number] | null = null;
      let bestGap = Infinity;
      for (const n of taskFeed) {
        if (n.kind !== "UPDATE" || usedNotes.has(n.id) || n.taskId !== item.taskId || n.userId !== item.userId) continue;
        const gap = Math.abs(new Date(n.at).getTime() - new Date(item.at).getTime());
        if (gap <= 1_000 && gap < bestGap) {
          best = n;
          bestGap = gap;
        }
      }
      if (best) usedNotes.add(best.id);
      mergedFeed.push(best ? { ...item, note: best.note || item.note, photos: best.photos } : item);
    }
    for (const item of taskFeed) if (item.kind !== "STATUS" && !usedNotes.has(item.id)) mergedFeed.push(item);
    mergedFeed.sort((a, b) => (a.at < b.at ? 1 : -1));

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
      attention: await CommandCenterService.attention(organizationId, date),
      approvals: {
        paymentsPendingCount: pendingPayments.length,
        paymentsPendingAmount: roundPaise(pendingPayments.reduce((s, p) => s + p.amount, 0)),
        ordersPendingCount: pendingOrders,
        materialRequestsPending,
      },
      projects: projects.slice(0, 8),
      finance: {
        outstandingPayables,
        trend,
      },
      team: Array.from(team.values())
        .map((m) => ({
          ...m,
          updates: m.updates.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20),
        }))
        .sort((a, b) => b.actions + b.taskUpdates - (a.actions + a.taskUpdates)),
      activity,
      taskFeed: mergedFeed.slice(0, 20).map(({ userId: _userId, ...rest }) => rest),
      people: {
        ...staffDay.totals,
        missing: staffDay.staff
          .filter((s) => !s.report && isReportingRole(s.user.role))
          .slice(0, 8)
          .map((s) => ({ userId: s.user.id, name: s.user.name, phone: s.user.phone })),
      },
      recentActivityDates: dayBook.recentActivityDates,
    };
  }
}
