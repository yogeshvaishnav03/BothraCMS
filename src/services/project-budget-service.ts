import { prisma } from "@/lib/db";
import { roundPaise } from "@/lib/financial-math";

/**
 * Budget vs actual for a project, split by cost head. All amounts are paise.
 *
 * - Actual: posted bills, plus posted payments that are not settling a bill
 *   (wages, cash purchases, fees paid directly).
 * - Committed: money promised but not billed yet: approved purchase orders and
 *   approved measurement-book entries that are not billed.
 * - Forecast = actual + committed; variance = budget - forecast.
 */

export const COST_HEADS = [
  { key: "MATERIAL", label: "Material" },
  { key: "LABOUR", label: "Labour & wages" },
  { key: "CONTRACTOR", label: "Contractors" },
  { key: "EQUIPMENT", label: "Equipment & machinery" },
  { key: "DESIGN", label: "Design & consultants" },
  { key: "APPROVALS", label: "Approvals & fees" },
  { key: "OVERHEADS", label: "Site overheads" },
  { key: "OTHER", label: "Other" },
] as const;

export type CostHead = (typeof COST_HEADS)[number]["key"];
export const COST_HEAD_KEYS = COST_HEADS.map((h) => h.key) as [CostHead, ...CostHead[]];

const OPEN_PO_STATUSES = ["APPROVED", "PLACED", "CONFIRMED"];
const UNBILLED_MB_STATUSES = ["VERIFIED", "APPROVED"];

function isCostHead(v: string | null | undefined): v is CostHead {
  return !!v && (COST_HEAD_KEYS as string[]).includes(v);
}

export function inferBillHead(bill: {
  costHead: string | null;
  party?: { partyType: string } | null;
  lines?: { materialId: string | null }[];
}): CostHead {
  if (isCostHead(bill.costHead)) return bill.costHead;
  if (bill.party?.partyType === "CONTRACTOR") return "CONTRACTOR";
  if (bill.lines?.some((l) => l.materialId)) return "MATERIAL";
  if (bill.party?.partyType === "VENDOR") return "MATERIAL";
  return "OTHER";
}

export function inferPaymentHead(payment: {
  costHead: string | null;
  recipientType: string | null;
  party?: { partyType: string } | null;
}): CostHead {
  if (isCostHead(payment.costHead)) return payment.costHead;
  if (payment.recipientType === "EMPLOYEE") return "LABOUR";
  if (payment.recipientType === "CONTRACTOR" || payment.party?.partyType === "CONTRACTOR") return "CONTRACTOR";
  if (payment.party?.partyType === "VENDOR") return "MATERIAL";
  return "OTHER";
}

function monthKey(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
}

function healthOf(budget: number, forecast: number): "NO_BUDGET" | "OK" | "WATCH" | "OVER" {
  if (budget <= 0) return forecast > 0 ? "NO_BUDGET" : "OK";
  const ratio = forecast / budget;
  if (ratio > 1) return "OVER";
  if (ratio >= 0.9) return "WATCH";
  return "OK";
}

async function loadSpend(organizationId: string, projectIds: string[]) {
  const [bills, payments, orders, measurements] = await Promise.all([
    prisma.bill.findMany({
      where: { organizationId, projectId: { in: projectIds }, status: "POSTED", isArchived: false },
      select: {
        id: true,
        projectId: true,
        totalAmount: true,
        billDate: true,
        costHead: true,
        party: { select: { id: true, name: true, partyType: true } },
        lines: { select: { materialId: true } },
      },
    }),
    prisma.payment.findMany({
      where: { organizationId, projectId: { in: projectIds }, status: "POSTED", isArchived: false },
      select: {
        id: true,
        projectId: true,
        amount: true,
        paymentDate: true,
        costHead: true,
        recipientType: true,
        recipientName: true,
        party: { select: { id: true, name: true, partyType: true } },
        allocations: { where: { reversedAt: null }, select: { amount: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { organizationId, projectId: { in: projectIds }, status: { in: OPEN_PO_STATUSES } },
      select: { projectId: true, totalAmount: true },
    }),
    prisma.measurementBookEntry.findMany({
      where: { organizationId, projectId: { in: projectIds }, status: { in: UNBILLED_MB_STATUSES }, billId: null },
      select: { projectId: true, totalAmount: true },
    }),
  ]);
  return { bills, payments, orders, measurements };
}

export class ProjectBudgetService {
  static async getProjectBudget(organizationId: string, projectId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, name: true, code: true, budgetAmount: true, startDate: true, endDate: true },
    });
    if (!project) return null;

    const [lines, spend] = await Promise.all([
      prisma.projectBudgetLine.findMany({ where: { organizationId, projectId } }),
      loadSpend(organizationId, [projectId]),
    ]);

    const heads = new Map(
      COST_HEADS.map((h) => [h.key as CostHead, { costHead: h.key as CostHead, label: h.label, budget: 0, actual: 0, committed: 0, notes: null as string | null }])
    );
    for (const l of lines) {
      const row = heads.get(isCostHead(l.costHead) ? l.costHead : "OTHER")!;
      row.budget += l.budgetAmount;
      row.notes = l.notes;
    }

    const monthly = new Map<string, number>();
    const byParty = new Map<string, { name: string; amount: number }>();
    const addParty = (id: string | undefined, name: string | null | undefined, amount: number) => {
      const key = id || `name:${name || "Unnamed"}`;
      const row = byParty.get(key) || { name: name || "Unnamed", amount: 0 };
      row.amount = roundPaise(row.amount + amount);
      byParty.set(key, row);
    };

    for (const b of spend.bills) {
      const head = heads.get(inferBillHead(b))!;
      head.actual = roundPaise(head.actual + b.totalAmount);
      monthly.set(monthKey(b.billDate), roundPaise((monthly.get(monthKey(b.billDate)) || 0) + b.totalAmount));
      addParty(b.party?.id, b.party?.name, b.totalAmount);
    }

    let paid = 0;
    for (const p of spend.payments) {
      paid = roundPaise(paid + p.amount);
      // The part of a payment that settles bills is already counted through the bill.
      const allocated = p.allocations.reduce((s, a) => s + a.amount, 0);
      const direct = roundPaise(p.amount - allocated);
      if (direct <= 0) continue;
      const head = heads.get(inferPaymentHead(p))!;
      head.actual = roundPaise(head.actual + direct);
      monthly.set(monthKey(p.paymentDate), roundPaise((monthly.get(monthKey(p.paymentDate)) || 0) + direct));
      addParty(p.party?.id, p.party?.name || p.recipientName, direct);
    }

    for (const o of spend.orders) {
      const head = heads.get("MATERIAL")!;
      head.committed = roundPaise(head.committed + (o.totalAmount || 0));
    }
    for (const m of spend.measurements) {
      const head = heads.get("CONTRACTOR")!;
      head.committed = roundPaise(head.committed + m.totalAmount);
    }

    const rows = Array.from(heads.values()).map((h) => {
      const forecast = roundPaise(h.actual + h.committed);
      return {
        ...h,
        forecast,
        variance: roundPaise(h.budget - forecast),
        usedPercent: h.budget > 0 ? Math.round((h.actual / h.budget) * 1000) / 10 : null,
        health: healthOf(h.budget, forecast),
      };
    });

    const totals = rows.reduce(
      (t, r) => ({
        budget: t.budget + r.budget,
        actual: roundPaise(t.actual + r.actual),
        committed: roundPaise(t.committed + r.committed),
      }),
      { budget: 0, actual: 0, committed: 0 }
    );
    // A project-level budget without a head-wise split still counts as the overall budget.
    const overallBudget = Math.max(Math.round(project.budgetAmount || 0), totals.budget);
    const forecast = roundPaise(totals.actual + totals.committed);

    // Last six months, oldest first, so the chart reads left to right.
    const months: { month: string; actual: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15));
      const key = d.toISOString().slice(0, 7);
      months.push({ month: key, actual: monthly.get(key) || 0 });
    }

    return {
      project,
      heads: rows,
      totals: {
        budget: overallBudget,
        allocated: totals.budget,
        unallocated: Math.max(0, overallBudget - totals.budget),
        actual: totals.actual,
        committed: totals.committed,
        forecast,
        variance: roundPaise(overallBudget - forecast),
        paid,
        usedPercent: overallBudget > 0 ? Math.round((totals.actual / overallBudget) * 1000) / 10 : null,
        health: healthOf(overallBudget, forecast),
      },
      monthly: months,
      topParties: Array.from(byParty.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    };
  }

  /** Replace the head-wise budget of a project. Heads left out keep their value. */
  static async saveBudget(
    organizationId: string,
    projectId: string,
    userId: string,
    lines: { costHead: CostHead; budgetAmount: number; notes?: string | null }[]
  ) {
    const before = await prisma.projectBudgetLine.findMany({ where: { organizationId, projectId } });
    await prisma.$transaction(
      lines.map((l) =>
        prisma.projectBudgetLine.upsert({
          where: { projectId_costHead: { projectId, costHead: l.costHead } },
          create: { organizationId, projectId, costHead: l.costHead, budgetAmount: Math.round(l.budgetAmount), notes: l.notes || null, updatedById: userId },
          update: { budgetAmount: Math.round(l.budgetAmount), notes: l.notes || null, updatedById: userId },
        })
      )
    );
    const after = await prisma.projectBudgetLine.findMany({ where: { organizationId, projectId } });
    const total = after.reduce((s, l) => s + l.budgetAmount, 0);
    const project = await prisma.project.findFirst({ where: { id: projectId, organizationId }, select: { budgetAmount: true } });
    // Keep the project's headline budget in step with the split when the split is larger.
    if (project && total > (project.budgetAmount || 0)) {
      await prisma.project.update({ where: { id: projectId }, data: { budgetAmount: total } });
    }
    await prisma.auditEvent.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: "PROJECT_BUDGET_UPDATED",
        entityType: "PROJECT",
        entityId: projectId,
        beforeJson: JSON.stringify(Object.fromEntries(before.map((l) => [l.costHead, l.budgetAmount]))),
        afterJson: JSON.stringify(Object.fromEntries(after.map((l) => [l.costHead, l.budgetAmount]))),
        reason: "Budget by cost head updated",
      },
    });
  }

  /** One row per active project: budget, spend and health, for dashboards and lists. */
  static async getPortfolio(organizationId: string, projectIds?: string[] | null) {
    const projects = await prisma.project.findMany({
      where: {
        organizationId,
        isArchived: false,
        status: { notIn: ["ARCHIVED"] },
        ...(projectIds ? { id: { in: projectIds } } : {}),
      },
      select: { id: true, name: true, code: true, status: true, budgetAmount: true, siteId: true, site: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    const ids = projects.map((p) => p.id);
    if (ids.length === 0) return [];

    const [lines, spend] = await Promise.all([
      prisma.projectBudgetLine.groupBy({ by: ["projectId"], where: { organizationId, projectId: { in: ids } }, _sum: { budgetAmount: true } }),
      loadSpend(organizationId, ids),
    ]);
    const budgetSplit = new Map(lines.map((l) => [l.projectId, l._sum.budgetAmount || 0]));
    const actual = new Map<string, number>();
    const committed = new Map<string, number>();
    const add = (m: Map<string, number>, id: string | null, v: number) => id && m.set(id, roundPaise((m.get(id) || 0) + v));

    spend.bills.forEach((b) => add(actual, b.projectId, b.totalAmount));
    spend.payments.forEach((p) => {
      const direct = roundPaise(p.amount - p.allocations.reduce((s, a) => s + a.amount, 0));
      if (direct > 0) add(actual, p.projectId, direct);
    });
    spend.orders.forEach((o) => add(committed, o.projectId, o.totalAmount || 0));
    spend.measurements.forEach((m) => add(committed, m.projectId, m.totalAmount));

    return projects.map((p) => {
      const budget = Math.max(Math.round(p.budgetAmount || 0), budgetSplit.get(p.id) || 0);
      const a = actual.get(p.id) || 0;
      const c = committed.get(p.id) || 0;
      return {
        projectId: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        siteId: p.siteId,
        siteName: p.site?.name || null,
        budget,
        actual: a,
        committed: c,
        forecast: roundPaise(a + c),
        usedPercent: budget > 0 ? Math.round((a / budget) * 1000) / 10 : null,
        health: healthOf(budget, a + c),
      };
    });
  }
}
