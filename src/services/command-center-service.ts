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
      prisma.siteIssue.count({ where: { organizationId, status: "OPEN", kind: { in: ["SAFETY_INCIDENT", "NEAR_MISS", "UNSAFE_ACT"] } } }).catch(() => 0),
      prisma.drawingRevision.count({ where: { status: "FOR_APPROVAL", drawing: { organizationId } } }).catch(() => 0),
      prisma.payrollRun.count({ where: { organizationId, status: "DRAFT" } }).catch(() => 0),
      prisma.salesInstallment.findMany({
        where: { booking: { organizationId, status: "ACTIVE" }, dueDate: { lt: date } },
        select: { amount: true, receivedAmount: true },
      }).catch(() => []),
      prisma.equipment.count({ where: { organizationId, status: "UNDER_REPAIR" } }).catch(() => 0),
    ]);
    return {
      openSafety: openSafety || 0,
      drawingsWaiting: drawingsWaiting || 0,
      payrollDraft: payrollDraft || 0,
      equipmentDown: equipmentDown || 0,
      customerOverdue: (dues || []).reduce((sum, d) => sum + Math.max(0, (d.amount || 0) - (d.receivedAmount || 0)), 0),
    };
  }

  static async getOverview(organizationId: string, date: string, siteId?: string) {
    const trendStart = shiftDate(date, -6);
    const rangeStart = new Date(`${trendStart}T00:00:00.000Z`);
    rangeStart.setTime(rangeStart.getTime() - 6 * 3600 * 1000);
    const rangeEnd = new Date(`${date}T23:59:59.999Z`);
    const dayStart = new Date(`${date}T00:00:00.000+05:30`);
    const dayEnd = new Date(`${date}T23:59:59.999+05:30`);

    // Dispatch all independent Command Center blocks concurrently with resilient error boundaries
    const [
      dayBook,
      pendingPayments,
      rejectedPayments,
      pendingOrders,
      postedBills,
      trendPayments,
      trendBills,
      trendIn,
      auditEvents,
      taskUpdates,
      taskComments,
      staffDay,
      portfolioWithProgress,
      materialRequestsPending,
      attentionData,
      dueTasksList,
    ] = await Promise.all([
      fetchDayBookData(organizationId, date, siteId).catch((err) => {
        console.warn("[COMMAND_CENTER] fetchDayBookData fallback:", err?.message || err);
        return {
          date,
          fromDate: date,
          toDate: date,
          summary: {
            totalPaymentsAmount: 0,
            totalRejectedPaymentsAmount: 0,
            totalBillsAmount: 0,
            totalMoneyInAmount: 0,
            moneyInCount: 0,
            paymentsCount: 0,
            rejectedPaymentsCount: 0,
            billsCount: 0,
            receiptsCount: 0,
            issuesCount: 0,
            workersPresentCount: 0,
            headcountTotal: 0,
            headcountArtisans: 0,
            headcountCraftsmen: 0,
            headcountLaborers: 0,
            staffPresentCount: 0,
            reportsCount: 0,
          },
          payments: [],
          moneyIn: [],
          bills: [],
          receipts: [],
          issues: [],
          staffAttendance: [],
          workerAttendance: [],
          attendance: [],
          headcount: [],
          dailyReports: [],
          recentActivityDates: [],
        };
      }),
      prisma.payment.findMany({
        where: { organizationId, status: "PENDING_APPROVAL", isArchived: false },
        include: {
          creator: { select: { id: true, name: true, role: true } },
          project: { select: { id: true, name: true, code: true, site: { select: { id: true, name: true } } } },
          party: { select: { id: true, name: true, partyType: true } },
        },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      }).catch(() => []),
      prisma.payment.findMany({
        where: { organizationId, status: "REJECTED", isArchived: false },
        select: { amount: true },
      }).catch(() => []),
      prisma.purchaseOrder.count({ where: { organizationId, status: "PENDING_APPROVAL" } }).catch(() => 0),
      prisma.bill.findMany({
        where: { organizationId, status: "POSTED", isArchived: false },
        include: {
          party: { select: { id: true, name: true, partyType: true } },
          project: { select: { id: true, name: true, code: true, site: { select: { id: true, name: true } } } },
          allocations: {
            where: { reversedAt: null, payment: { status: "POSTED" } },
            select: { amount: true },
          },
        },
        orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      }).catch(() => []),
      prisma.payment.findMany({
        where: {
          organizationId,
          status: "POSTED",
          isArchived: false,
          paymentDate: { gte: rangeStart, lte: rangeEnd },
        },
        select: { amount: true, paymentDate: true },
      }).catch(() => []),
      prisma.bill.findMany({
        where: { organizationId, isArchived: false, billDate: { gte: rangeStart, lte: rangeEnd } },
        select: { totalAmount: true, billDate: true },
      }).catch(() => []),
      prisma.salesReceipt.findMany({
        where: { organizationId, date: { gte: trendStart, lte: date }, cancelledAt: null, booking: { status: "ACTIVE" } },
        select: { amount: true, date: true },
      }).catch(() => []),
      prisma.auditEvent.findMany({
        where: { organizationId, createdAt: { gte: dayStart, lte: dayEnd } },
        include: { actor: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }).catch(() => []),
      prisma.taskStatusHistory.findMany({
        where: { createdAt: { gte: dayStart, lte: dayEnd }, task: { organizationId } },
        include: {
          user: { select: { id: true, name: true, role: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }).catch(() => []),
      prisma.taskComment.findMany({
        where: { organizationId, createdAt: { gte: dayStart, lte: dayEnd } },
        include: {
          user: { select: { id: true, name: true, role: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }).catch(() => []),
      WorkReportService.dayOverview(organizationId, date).catch(() => ({
        staff: [],
        totals: {
          expected: 0,
          submitted: 0,
          present: 0,
          onLeave: 0,
          hours: 0,
          withBlockers: 0,
        },
      })),
      ProjectBudgetService.getPortfolio(organizationId).then(async (pf) => ({
        portfolio: pf || [],
        progress: await MilestoneService.progressByProject(
          organizationId,
          (pf || []).map((p) => p.projectId)
        ).catch(() => new Map()),
      })).catch(() => ({ portfolio: [], progress: new Map() })),
      prisma.materialRequest.count({ where: { organizationId, status: "PENDING" } }).catch(() => 0),
      CommandCenterService.attention(organizationId, date).catch(() => ({
        openSafety: 0,
        drawingsWaiting: 0,
        payrollDraft: 0,
        equipmentDown: 0,
        customerOverdue: 0,
      })),
      prisma.task.findMany({
        where: {
          organizationId,
          isArchived: false,
          status: { notIn: ["COMPLETED", "VERIFIED", "ARCHIVED"] },
          ...(siteId ? { project: { siteId } } : {}),
        },
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          status: true,
          dueAt: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, role: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: [
          { dueAt: "asc" },
          { createdAt: "desc" },
        ],
        take: 50,
      }).catch((err) => {
        console.warn("[COMMAND_CENTER] dueTasks fallback:", err);
        return [];
      }),
    ]);

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

    for (const p of (dayBook?.payments || []) as any[]) {
      timeline.push({
        id: `pay-${p.id}`,
        kind: "PAYMENT",
        at: resolveTimelineTime(p.createdAt || p.paymentDate, 15, 30),
        title: `Paid ${p.party?.name || p.recipientName || "payee"}`,
        detail: [p.method, p.referenceNumber, p.project?.name, p.status === "PENDING_APPROVAL" ? "awaiting approval" : null]
          .filter(Boolean)
          .join(" · "),
        amount: p.amount || 0,
        actor: p.creator?.name,
        href: "/finance",
      });
    }
    for (const r of (dayBook?.moneyIn || [])) {
      timeline.push({
        id: `in-${r.id}`,
        kind: "MONEY_IN",
        at: resolveTimelineTime(r.createdAt || r.date, 14, 0),
        title: `Received from ${r.booking?.customerName || "Customer"}`,
        detail: [r.receiptNumber, r.booking?.unit?.unitNumber, r.installment?.label, r.booking?.unit?.project?.name].filter(Boolean).join(" · "),
        amount: r.amount || 0,
        actor: r.creator?.name,
        href: `/day-book?from=${r.date}&to=${r.date}`,
      });
    }
    for (const b of (dayBook?.bills || []) as any[]) {
      timeline.push({
        id: `bill-${b.id}`,
        kind: "BILL",
        at: resolveTimelineTime(b.createdAt || b.billDate, 12, 15),
        title: `Bill ${b.billNumber || ""} from ${b.party?.name || "party"}`,
        detail: b.project?.name || "General",
        amount: b.totalAmount || 0,
        href: "/finance",
      });
    }
    for (const m of (dayBook?.receipts || []) as any[]) {
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
    for (const m of (dayBook?.issues || []) as any[]) {
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
    for (const a of (dayBook?.attendance || []) as any[]) {
      const displayName = a.name || a.workforceMember?.name || "Staff Member";
      const displaySite = a.site?.name || a.siteName || null;
      timeline.push({
        id: `att-${a.id}`,
        kind: "ATTENDANCE",
        at: resolveTimelineTime(a.checkInAt, 9, 0),
        title: `${displayName} checked in`,
        detail: [displaySite, a.checkOutAt ? "checked out" : "on site"].filter(Boolean).join(" · "),
        href: "/attendance",
      });
    }
    for (const h of (dayBook?.headcount || []) as any[]) {
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
    for (const r of (dayBook?.dailyReports || []) as any[]) {
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

    // ── 3. Outstanding payables (bills − posted allocations) ──────────────
    let outstandingPayables = 0;
    for (const b of (postedBills || [])) {
      const paid = (b.allocations || []).reduce((s: number, a: any) => s + (a.amount ?? 0), 0);
      const remaining = roundPaise((b.totalAmount || 0) - paid);
      if (remaining > 0) outstandingPayables = roundPaise(outstandingPayables + remaining);
    }

    // ── 4. Seven-day cash trend ending on `date` ───────────────────────────
    const trend = Array.from({ length: 7 }, (_, i) => ({ date: shiftDate(trendStart, i), paid: 0, billed: 0, received: 0 }));
    const byDate = new Map(trend.map((t) => [t.date, t]));
    for (const p of (trendPayments || [])) {
      const slot = byDate.get(istDateKey(p.paymentDate));
      if (slot) slot.paid = roundPaise(slot.paid + (p.amount || 0));
    }
    for (const r of (trendIn || [])) {
      const slot = byDate.get(r.date);
      if (slot) slot.received += (r.amount || 0);
    }
    for (const b of (trendBills || [])) {
      const slot = byDate.get(istDateKey(b.billDate));
      if (slot) slot.billed = roundPaise(slot.billed + (b.totalAmount || 0));
    }

    // ── 5. Who did what on this date ───────────────────────────────────────
    const { portfolio = [], progress = new Map() } = portfolioWithProgress || {};
    const projects = (portfolio || [])
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
        progress: progress?.get ? progress.get(p.projectId)?.progress ?? null : null,
        delayedStages: progress?.get ? progress.get(p.projectId)?.delayed ?? 0 : 0,
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
      ...(taskUpdates || []).filter((h) => h.oldStatus && h.oldStatus !== "NONE").map((h) => ({
        id: `status-${h.id}`,
        at: h.createdAt.toISOString(),
        actor: h.user?.name || "Someone",
        taskId: h.task?.id || h.taskId || "task",
        taskTitle: h.task?.title || "Task",
        kind: "STATUS" as const,
        text: `moved to ${statusLabel(h.newStatus)}`,
        status: h.newStatus,
        note: h.note,
        photos: [] as string[],
        userId: h.changedBy,
      })),
      ...(taskComments || []).map((c) => ({
        id: `comment-${c.id}`,
        at: c.createdAt.toISOString(),
        actor: c.user?.name || "Someone",
        taskId: c.task?.id || c.taskId || "task",
        taskTitle: c.task?.title || "Task",
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
      ...(auditEvents || []).slice(0, 25).map((e) => ({
        id: `audit-${e.id}`,
        at: e.createdAt.toISOString(),
        actor: e.actor?.name || "System",
        action: e.action,
        entityType: e.entityType,
        reason: e.reason,
      })),
      ...(taskUpdates || []).slice(0, 25).map((h) => ({
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

    const nowMs = Date.now();
    const formattedDueTasks = (dueTasksList || [])
      .map((t: any) => {
        const isOverdue = t.dueAt ? new Date(t.dueAt).getTime() < nowMs : false;
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: t.status,
          dueAt: t.dueAt ? (typeof t.dueAt === "string" ? t.dueAt : t.dueAt.toISOString()) : null,
          isOverdue,
          projectName: t.project?.name || "General Project",
          assigneeName: t.assignee?.name || "Unassigned",
          assigneeRole: t.assignee?.role || null,
          creatorName: t.creator?.name || null,
          createdAt: t.createdAt ? (typeof t.createdAt === "string" ? t.createdAt : t.createdAt.toISOString()) : new Date().toISOString(),
        };
      })
      .sort((a: any, b: any) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        if (a.dueAt && !b.dueAt) return -1;
        if (!a.dueAt && b.dueAt) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const dueTasksCount = formattedDueTasks.length;
    const overdueTasksCount = formattedDueTasks.filter((t: any) => t.isOverdue).length;

    return {
      date,
      summary: dayBook?.summary || {
        totalPaymentsAmount: 0,
        totalRejectedPaymentsAmount: 0,
        totalBillsAmount: 0,
        totalMoneyInAmount: 0,
        moneyInCount: 0,
        paymentsCount: 0,
        rejectedPaymentsCount: 0,
        billsCount: 0,
        receiptsCount: 0,
        issuesCount: 0,
        workersPresentCount: 0,
        headcountTotal: 0,
        headcountArtisans: 0,
        headcountCraftsmen: 0,
        headcountLaborers: 0,
        staffPresentCount: 0,
        reportsCount: 0,
      },
      payments: (dayBook?.payments || []).map((p: any) => ({
        id: p.id,
        amount: p.amount,
        referenceNumber: p.referenceNumber,
        recipientName: p.recipientName || p.party?.name || "Recipient",
        recipientType: p.recipientType || p.party?.partyType || "VENDOR",
        costHead: p.costHead,
        method: p.method,
        payingAccount: p.payingAccount,
        notes: p.notes,
        approvalQuery: p.approvalQuery,
        status: p.status,
        paymentDate: p.paymentDate,
        createdAt: p.createdAt,
        projectName: p.project?.name,
        siteName: p.project?.site?.name,
        creatorName: p.creator?.name,
        attachments: p.attachments || [],
      })),
      bills: (dayBook?.bills || []).map((b: any) => ({
        id: b.id,
        billNumber: b.billNumber,
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        outstandingAmount: b.outstandingAmount,
        partyName: b.party?.name,
        projectName: b.project?.name,
        billDate: b.billDate,
        dueDate: b.dueDate,
        status: b.status,
      })),
      unpaidBills: (postedBills || [])
        .map((b: any) => {
          const paid = (b.allocations || []).reduce((s: number, a: any) => s + (a.amount ?? 0), 0);
          const remaining = roundPaise((b.totalAmount || 0) - paid);
          return {
            id: b.id,
            billNumber: b.billNumber,
            totalAmount: b.totalAmount,
            paidAmount: paid,
            outstandingAmount: remaining,
            partyName: b.party?.name || "Vendor",
            projectName: b.project?.name,
            siteName: b.project?.site?.name,
            billDate: b.billDate,
            dueDate: b.dueDate,
            status: b.status,
          };
        })
        .filter((b: any) => b.outstandingAmount > 0)
        .slice(0, 50),
      timeline: timeline.slice(0, 80),
      timelineTotal: timeline.length,
      attention: attentionData,
      approvals: {
        paymentsPendingCount: (pendingPayments || []).length,
        paymentsPendingAmount: roundPaise((pendingPayments || []).reduce((s, p) => s + (p.amount || 0), 0)),
        pendingPaymentsList: (pendingPayments || []).map((p: any) => ({
          id: p.id,
          amount: p.amount,
          referenceNumber: p.referenceNumber,
          recipientName: p.recipientName || p.party?.name || "Recipient",
          recipientType: p.recipientType || p.party?.partyType || "VENDOR",
          costHead: p.costHead,
          method: p.method,
          notes: p.notes,
          approvalQuery: p.approvalQuery,
          paymentDate: p.paymentDate,
          createdAt: p.createdAt,
          projectName: p.project?.name,
          siteName: p.project?.site?.name,
          creatorName: p.creator?.name,
        })),
        paymentsRejectedCount: (rejectedPayments || []).length,
        ordersPendingCount: pendingOrders || 0,
        materialRequestsPending: materialRequestsPending || 0,
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
        ...(staffDay?.totals || {
          expected: 0,
          submitted: 0,
          present: 0,
          onLeave: 0,
          hours: 0,
          withBlockers: 0,
        }),
        missing: (staffDay?.staff || [])
          .filter((s: any) => !s.report && s.user && isReportingRole(s.user.role))
          .slice(0, 8)
          .map((s: any) => ({ userId: s.user?.id, name: s.user?.name, phone: s.user?.phone })),
      },
      recentActivityDates: dayBook?.recentActivityDates || [],
      dueTasks: formattedDueTasks,
      dueTasksCount,
      overdueTasksCount,
    };
  }
}
