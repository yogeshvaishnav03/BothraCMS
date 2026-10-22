import { prisma } from "@/lib/db";
import type { UserContext } from "@/lib/auth";
import { isOrgOwnerOrAdmin } from "@/lib/server-auth";
import { istDateKey, monthDays } from "@/lib/ist-date";

/**
 * Monthly payroll worked out from attendance.
 *
 * Site workers (WorkforceMember) are paid their daily wage for each day
 * present, half for a half day, plus overtime beyond 8 hours at the hourly
 * rate (daily wage / 8). Labour cost is booked to the project where the
 * worker spent most days.
 *
 * Staff with a login are paid a monthly salary pro-rata: every calendar day is
 * paid except Monday–Saturday working days with no check-in and no leave
 * (loss of pay). Leave marked by HR is paid. Days still ahead in the current
 * month are paid.
 *
 * Open advances given on or before the month end are deducted, oldest first,
 * as long as they fit in the pay. All amounts are in paise.
 */

export class PayrollError extends Error {
  constructor(message: string, public statusCode = 422, public code = "PAYROLL_INVALID") {
    super(message);
  }
}

export const STANDARD_HOURS = 8;

export function isMonthKey(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

const sessionDayValue = (status: string) => (status === "HALF_DAY" ? 0.5 : status === "ABSENT" ? 0 : 1);

function hoursOf(checkIn: Date, checkOut: Date | null) {
  if (!checkOut) return 0;
  return Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 3_600_000);
}

function recompute(line: { basePay: number; overtimePay: number; bonus: number; advanceDeduction: number; otherDeduction: number }) {
  const gross = line.basePay + line.overtimePay + line.bonus;
  const net = Math.max(0, gross - line.advanceDeduction - line.otherDeduction);
  return { gross, net };
}

interface DraftLine {
  personType: "LABOUR" | "STAFF";
  personId: string;
  personName: string;
  roleLabel: string | null;
  projectId: string | null;
  daysPresent: number;
  halfDays: number;
  leaveDays: number;
  payableDays: number;
  overtimeHours: number;
  rate: number;
  basePay: number;
  overtimePay: number;
}

/** Labour lines from site attendance. */
async function labourLines(organizationId: string, month: string): Promise<DraftLine[]> {
  const days = monthDays(month);
  const [members, sessions] = await Promise.all([
    prisma.workforceMember.findMany({
      where: { organizationId, isArchived: false, active: true },
      select: { id: true, name: true, workerType: true, dailyWageRate: true },
    }),
    prisma.attendanceSession.findMany({
      where: { organizationId, isArchived: false, workDate: { gte: days[0], lte: days[days.length - 1] } },
      select: { workforceMemberId: true, workDate: true, status: true, checkInAt: true, checkOutAt: true, projectId: true },
    }),
  ]);

  const byMember = new Map<string, typeof sessions>();
  sessions.forEach((s) => {
    const list = byMember.get(s.workforceMemberId) || [];
    list.push(s);
    byMember.set(s.workforceMemberId, list);
  });

  const lines: DraftLine[] = [];
  for (const m of members) {
    const list = byMember.get(m.id);
    if (!list || list.length === 0) continue;
    // A worker can be marked at two sites the same day; pay that day once, at its best value.
    const dayValue = new Map<string, number>();
    const dayHours = new Map<string, number>();
    const projectDays = new Map<string, number>();
    for (const s of list) {
      const v = sessionDayValue(s.status);
      dayValue.set(s.workDate, Math.max(dayValue.get(s.workDate) || 0, v));
      dayHours.set(s.workDate, (dayHours.get(s.workDate) || 0) + hoursOf(s.checkInAt, s.checkOutAt));
      if (s.projectId && v > 0) projectDays.set(s.projectId, (projectDays.get(s.projectId) || 0) + v);
    }
    const values = Array.from(dayValue.values());
    const payableDays = values.reduce((a, b) => a + b, 0);
    if (payableDays === 0) continue;
    const overtimeHours =
      Math.round(Array.from(dayHours.values()).reduce((sum, h) => sum + Math.max(0, h - STANDARD_HOURS), 0) * 10) / 10;
    const rate = Math.round(m.dailyWageRate || 0); // stored in paise
    const topProject = Array.from(projectDays.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    lines.push({
      personType: "LABOUR",
      personId: m.id,
      personName: m.name,
      roleLabel: m.workerType,
      projectId: topProject,
      daysPresent: values.filter((v) => v === 1).length,
      halfDays: values.filter((v) => v === 0.5).length,
      leaveDays: 0,
      payableDays,
      overtimeHours,
      rate,
      basePay: Math.round(rate * payableDays),
      overtimePay: Math.round((rate / STANDARD_HOURS) * overtimeHours),
    });
  }
  return lines;
}

/** Staff lines from check-ins and leave, for everyone with a salary set. */
async function staffLines(organizationId: string, month: string): Promise<DraftLine[]> {
  const days = monthDays(month);
  const today = istDateKey();
  const profiles = await prisma.payrollProfile.findMany({ where: { organizationId, monthlySalary: { gt: 0 } } });
  if (profiles.length === 0) return [];
  const userIds = profiles.map((p) => p.userId);
  const [users, records] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds }, organizationId, status: "ACTIVE" }, select: { id: true, name: true, jobTitle: true, role: true } }),
    prisma.staffAttendance.findMany({
      where: { organizationId, userId: { in: userIds }, workDate: { gte: days[0], lte: days[days.length - 1] } },
      select: { userId: true, workDate: true, status: true },
    }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));

  const lines: DraftLine[] = [];
  for (const p of profiles) {
    const u = userMap.get(p.userId);
    if (!u) continue;
    const mine = new Map(records.filter((r) => r.userId === p.userId).map((r) => [r.workDate, r.status]));
    let present = 0;
    let half = 0;
    let leave = 0;
    let lossOfPay = 0;
    for (const d of days) {
      const status = mine.get(d);
      if (status === "PRESENT") present++;
      else if (status === "HALF_DAY") {
        half++;
        lossOfPay += 0.5;
      } else if (status === "LEAVE") leave++;
      else {
        const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
        if (weekday !== 0 && d <= today) lossOfPay += 1;
      }
    }
    const payableDays = days.length - lossOfPay;
    lines.push({
      personType: "STAFF",
      personId: u.id,
      personName: u.name,
      roleLabel: u.jobTitle || u.role.replace(/_/g, " "),
      projectId: null,
      daysPresent: present,
      halfDays: half,
      leaveDays: leave,
      payableDays,
      overtimeHours: 0,
      rate: p.monthlySalary,
      basePay: Math.round((p.monthlySalary * payableDays) / days.length),
      overtimePay: 0,
    });
  }
  return lines;
}

async function refreshTotals(runId: string) {
  const lines = await prisma.payrollLine.findMany({ where: { runId } });
  const totalGross = lines.reduce((s, l) => s + l.gross, 0);
  const totalNet = lines.reduce((s, l) => s + l.net, 0);
  await prisma.payrollRun.update({ where: { id: runId }, data: { totalGross, totalNet, totalDeductions: totalGross - totalNet } });
}

async function nameMap(ids: (string | null | undefined)[]) {
  const clean = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (clean.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: clean } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export class PayrollService {
  static async listRuns(organizationId: string) {
    const runs = await prisma.payrollRun.findMany({
      where: { organizationId },
      orderBy: { month: "desc" },
      take: 24,
      include: { _count: { select: { lines: true } } },
    });
    return runs.map((r) => ({ ...r, people: r._count.lines }));
  }

  static async getRun(organizationId: string, month: string) {
    const run = await prisma.payrollRun.findUnique({
      where: { organizationId_month: { organizationId, month } },
      include: { lines: { orderBy: [{ personType: "asc" }, { personName: "asc" }] } },
    });
    if (!run) return null;
    const projectIds = Array.from(new Set(run.lines.map((l) => l.projectId).filter(Boolean) as string[]));
    const [projects, names] = await Promise.all([
      prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
      nameMap([run.createdBy, run.approvedBy]),
    ]);
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    return {
      ...run,
      createdByName: names.get(run.createdBy) || null,
      approvedByName: run.approvedBy ? names.get(run.approvedBy) || null : null,
      lines: run.lines.map((l) => ({ ...l, projectName: l.projectId ? projectName.get(l.projectId) || null : null })),
    };
  }

  /** Works out (or re-works) the month's payroll. Only a draft can be regenerated. */
  static async generate(user: UserContext, month: string) {
    if (!isMonthKey(month)) throw new PayrollError("Pick a month as YYYY-MM.");
    if (month > istDateKey().slice(0, 7)) throw new PayrollError("You cannot run payroll for a future month.");
    const orgId = user.organizationId;
    const existing = await prisma.payrollRun.findUnique({ where: { organizationId_month: { organizationId: orgId, month } } });
    if (existing && existing.status !== "DRAFT") {
      throw new PayrollError(`Payroll for ${month} is already ${existing.status.toLowerCase()}.`, 409, "PAYROLL_LOCKED");
    }

    const drafts = [...(await labourLines(orgId, month)), ...(await staffLines(orgId, month))];
    const monthEnd = monthDays(month).slice(-1)[0];

    // Keep manual bonus / deduction / note from the previous draft.
    const previous = existing ? await prisma.payrollLine.findMany({ where: { runId: existing.id } }) : [];
    const kept = new Map(previous.map((l) => [`${l.personType}:${l.personId}`, l]));

    return prisma.$transaction(async (tx) => {
      const run = existing
        ? existing
        : await tx.payrollRun.create({ data: { organizationId: orgId, month, createdBy: user.userId } });
      if (existing) {
        await tx.payrollAdvance.updateMany({ where: { recoveredRunId: run.id }, data: { recoveredRunId: null } });
        await tx.payrollLine.deleteMany({ where: { runId: run.id } });
      }

      const advances = await tx.payrollAdvance.findMany({
        where: { organizationId: orgId, recoveredRunId: null, givenOn: { lte: monthEnd } },
        orderBy: { givenOn: "asc" },
      });

      let totalGross = 0;
      let totalNet = 0;
      for (const d of drafts) {
        const prev = kept.get(`${d.personType}:${d.personId}`);
        const bonus = prev?.bonus || 0;
        const otherDeduction = prev?.otherDeduction || 0;
        let room = d.basePay + d.overtimePay + bonus - otherDeduction;
        let advanceDeduction = 0;
        const recovered: string[] = [];
        for (const a of advances.filter((x) => x.personType === d.personType && x.personId === d.personId)) {
          if (a.amount <= room) {
            room -= a.amount;
            advanceDeduction += a.amount;
            recovered.push(a.id);
          }
        }
        const { gross, net } = recompute({ basePay: d.basePay, overtimePay: d.overtimePay, bonus, advanceDeduction, otherDeduction });
        await tx.payrollLine.create({
          data: { runId: run.id, ...d, bonus, otherDeduction, advanceDeduction, gross, net, note: prev?.note || null },
        });
        if (recovered.length) await tx.payrollAdvance.updateMany({ where: { id: { in: recovered } }, data: { recoveredRunId: run.id } });
        totalGross += gross;
        totalNet += net;
      }

      await tx.payrollRun.update({
        where: { id: run.id },
        data: { totalGross, totalNet, totalDeductions: totalGross - totalNet },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: orgId,
          actorUserId: user.userId,
          action: existing ? "PAYROLL_REGENERATED" : "PAYROLL_CREATED",
          entityType: "PAYROLL_RUN",
          entityId: run.id,
          afterJson: JSON.stringify({ month, people: drafts.length, totalNet }),
        },
      });
      return run.id;
    });
  }

  /** Bonus, extra deduction or note on one line of a draft. */
  static async editLine(user: UserContext, lineId: string, input: { bonus?: number; otherDeduction?: number; note?: string | null }) {
    const line = await prisma.payrollLine.findFirst({ where: { id: lineId, run: { organizationId: user.organizationId } }, include: { run: true } });
    if (!line) throw new PayrollError("Payroll line not found", 404, "NOT_FOUND");
    if (line.run.status !== "DRAFT") throw new PayrollError("This payroll is locked. Only a draft can be changed.", 409, "PAYROLL_LOCKED");
    const next = {
      basePay: line.basePay,
      overtimePay: line.overtimePay,
      bonus: input.bonus ?? line.bonus,
      advanceDeduction: line.advanceDeduction,
      otherDeduction: input.otherDeduction ?? line.otherDeduction,
    };
    if (next.advanceDeduction + next.otherDeduction > next.basePay + next.overtimePay + next.bonus) {
      throw new PayrollError("Deductions cannot be more than the pay.");
    }
    const { gross, net } = recompute(next);
    await prisma.payrollLine.update({
      where: { id: lineId },
      data: { bonus: next.bonus, otherDeduction: next.otherDeduction, gross, net, note: input.note === undefined ? line.note : input.note },
    });
    await refreshTotals(line.runId);
    return line.run.month;
  }

  /** An admin signs off the draft. */
  static async approve(user: UserContext, month: string) {
    if (!isOrgOwnerOrAdmin(user)) throw new PayrollError("Only an admin can approve payroll.", 403, "FORBIDDEN");
    const run = await prisma.payrollRun.findUnique({ where: { organizationId_month: { organizationId: user.organizationId, month } } });
    if (!run) throw new PayrollError("Payroll not found", 404, "NOT_FOUND");
    if (run.status !== "DRAFT") throw new PayrollError(`Payroll is already ${run.status.toLowerCase()}.`, 409, "PAYROLL_LOCKED");
    await prisma.$transaction([
      prisma.payrollRun.update({ where: { id: run.id }, data: { status: "APPROVED", approvedBy: user.userId, approvedAt: new Date() } }),
      prisma.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "PAYROLL_APPROVED",
          entityType: "PAYROLL_RUN",
          entityId: run.id,
          afterJson: JSON.stringify({ month, totalNet: run.totalNet }),
        },
      }),
    ]);
  }

  /**
   * Records the salary payments. Each line becomes a posted payment, so labour
   * cost shows in the project's budget (Labour head) and in the Day Book.
   */
  static async markPaid(user: UserContext, month: string, input: { method: string; payingAccount?: string | null; paymentDate?: string | null }) {
    const run = await prisma.payrollRun.findUnique({
      where: { organizationId_month: { organizationId: user.organizationId, month } },
      include: { lines: true },
    });
    if (!run) throw new PayrollError("Payroll not found", 404, "NOT_FOUND");
    if (run.status !== "APPROVED") {
      throw new PayrollError(run.status === "PAID" ? "This payroll is already paid." : "Approve the payroll before paying it.", 409, "PAYROLL_NOT_APPROVED");
    }
    const paymentDate = input.paymentDate ? new Date(`${input.paymentDate}T12:00:00+05:30`) : new Date();

    await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const line of run.lines) {
        if (line.net <= 0) continue;
        n++;
        const payment = await tx.payment.create({
          data: {
            organizationId: user.organizationId,
            recipientType: "EMPLOYEE",
            recipientName: line.personName,
            projectId: line.projectId,
            paymentDate,
            amount: line.net,
            method: input.method,
            payingAccount: input.payingAccount || null,
            costHead: line.personType === "LABOUR" ? "LABOUR" : "OVERHEADS",
            referenceNumber: `SAL-${month}-${String(n).padStart(3, "0")}`,
            status: "POSTED",
            approvedBy: run.approvedBy,
            approvedAt: run.approvedAt,
            idempotencyKey: `payroll-${line.id}`,
            notes: `${line.personType === "LABOUR" ? "Wages" : "Salary"} for ${month}`,
            createdBy: user.userId,
          },
        });
        await tx.payrollLine.update({ where: { id: line.id }, data: { paymentId: payment.id } });
      }
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: "PAID", paidAt: new Date() } });
      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "PAYROLL_PAID",
          entityType: "PAYROLL_RUN",
          entityId: run.id,
          afterJson: JSON.stringify({ month, payments: n, totalNet: run.totalNet, method: input.method }),
        },
      });
    });
  }

  static async payslip(organizationId: string, lineId: string) {
    const line = await prisma.payrollLine.findFirst({ where: { id: lineId, run: { organizationId } }, include: { run: true } });
    if (!line) return null;
    const [org, project, advances] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      line.projectId ? prisma.project.findUnique({ where: { id: line.projectId }, select: { name: true } }) : null,
      prisma.payrollAdvance.findMany({ where: { recoveredRunId: line.runId, personType: line.personType, personId: line.personId }, orderBy: { givenOn: "asc" } }),
    ]);
    return { ...line, organizationName: org?.name || "", projectName: project?.name || null, advances };
  }

  // ── Salaries and advances ────────────────────────────────────────────────

  /** Every active staff login with their salary (if set). */
  static async listProfiles(organizationId: string) {
    const [users, profiles] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId, status: "ACTIVE" },
        select: { id: true, name: true, role: true, jobTitle: true, phone: true },
        orderBy: { name: "asc" },
      }),
      prisma.payrollProfile.findMany({ where: { organizationId } }),
    ]);
    const byUser = new Map(profiles.map((p) => [p.userId, p]));
    return users.map((u) => {
      const p = byUser.get(u.id);
      return {
        ...u,
        monthlySalary: p?.monthlySalary || 0,
        bankAccountMasked: p?.bankAccount ? `••••${p.bankAccount.slice(-4)}` : null,
        ifsc: p?.ifsc || null,
      };
    });
  }

  static async saveProfile(user: UserContext, userId: string, input: { monthlySalary: number; bankAccount?: string | null; ifsc?: string | null }) {
    const target = await prisma.user.findFirst({ where: { id: userId, organizationId: user.organizationId } });
    if (!target) throw new PayrollError("Staff member not found", 404, "NOT_FOUND");
    const data: any = { monthlySalary: Math.round(input.monthlySalary) };
    if (input.bankAccount !== undefined) data.bankAccount = input.bankAccount || null;
    if (input.ifsc !== undefined) data.ifsc = input.ifsc ? input.ifsc.toUpperCase() : null;
    await prisma.payrollProfile.upsert({
      where: { organizationId_userId: { organizationId: user.organizationId, userId } },
      create: { organizationId: user.organizationId, userId, ...data },
      update: data,
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "SALARY_UPDATED",
        entityType: "USER",
        entityId: userId,
        afterJson: JSON.stringify({ monthlySalary: data.monthlySalary }),
      },
    });
  }

  static async listAdvances(organizationId: string) {
    const advances = await prisma.payrollAdvance.findMany({ where: { organizationId }, orderBy: { givenOn: "desc" }, take: 200 });
    const runIds = Array.from(new Set(advances.map((a) => a.recoveredRunId).filter(Boolean) as string[]));
    const runs = await prisma.payrollRun.findMany({ where: { id: { in: runIds } }, select: { id: true, month: true } });
    const month = new Map(runs.map((r) => [r.id, r.month]));
    return advances.map((a) => ({ ...a, recoveredIn: a.recoveredRunId ? month.get(a.recoveredRunId) || null : null }));
  }

  static async giveAdvance(user: UserContext, input: { personType: "LABOUR" | "STAFF"; personId: string; amount: number; givenOn?: string | null; note?: string | null }) {
    let personName: string | null = null;
    if (input.personType === "LABOUR") {
      const m = await prisma.workforceMember.findFirst({ where: { id: input.personId, organizationId: user.organizationId } });
      personName = m?.name || null;
    } else {
      const u = await prisma.user.findFirst({ where: { id: input.personId, organizationId: user.organizationId } });
      personName = u?.name || null;
    }
    if (!personName) throw new PayrollError("Person not found", 404, "NOT_FOUND");
    const advance = await prisma.payrollAdvance.create({
      data: {
        organizationId: user.organizationId,
        personType: input.personType,
        personId: input.personId,
        personName,
        amount: Math.round(input.amount),
        givenOn: input.givenOn || istDateKey(),
        note: input.note || null,
        createdBy: user.userId,
      },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "ADVANCE_GIVEN",
        entityType: "PAYROLL_ADVANCE",
        entityId: advance.id,
        afterJson: JSON.stringify({ personName, amount: advance.amount }),
      },
    });
    return advance;
  }

  /** Workers who can receive an advance. */
  static async people(organizationId: string) {
    const [labour, staff] = await Promise.all([
      prisma.workforceMember.findMany({ where: { organizationId, isArchived: false, active: true }, select: { id: true, name: true, workerType: true }, orderBy: { name: "asc" } }),
      prisma.user.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true, jobTitle: true }, orderBy: { name: "asc" } }),
    ]);
    return [
      ...labour.map((l) => ({ personType: "LABOUR" as const, personId: l.id, name: l.name, label: l.workerType })),
      ...staff.map((s) => ({ personType: "STAFF" as const, personId: s.id, name: s.name, label: s.jobTitle || "Staff" })),
    ];
  }
}
