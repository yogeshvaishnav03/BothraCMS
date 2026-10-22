import { prisma } from "@/lib/db";
import type { UserContext } from "@/lib/auth";
import { isOrgOwnerOrAdmin } from "@/lib/server-auth";
import { istDateKey, monthDays } from "@/lib/ist-date";
import { companyProfile } from "@/lib/company";
import { fyMonths, fyOf, monthlyTds, monthsLeftInFy, projectYear, type TaxRegime, type YearSoFar } from "@/lib/income-tax";

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
 *
 * Statutory deductions apply to staff: PF (12% of basic up to the wage
 * ceiling) and ESI (0.75% while gross is within the limit) when switched on in
 * their salary record, and professional tax by the state set for payroll.
 * TDS is typed in per person.
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

export const PF_RATE = 12; // % of PF wages, employee and employer each
export const PF_WAGE_CEILING = 15_000_00; // paise
export const ESI_EMPLOYEE_RATE = 0.75;
export const ESI_EMPLOYER_RATE = 3.25;
export const ESI_GROSS_LIMIT = 21_000_00; // paise

/** Monthly professional tax by state, on gross pay (paise). `feb` is the February amount where it differs. */
export const PT_STATES: Record<string, { name: string; slabs: { upTo: number | null; tax: number; feb?: number }[] }> = {
  NONE: { name: "No professional tax", slabs: [{ upTo: null, tax: 0 }] },
  MAHARASHTRA: { name: "Maharashtra", slabs: [{ upTo: 7_500_00, tax: 0 }, { upTo: 10_000_00, tax: 175_00 }, { upTo: null, tax: 200_00, feb: 300_00 }] },
  KARNATAKA: { name: "Karnataka", slabs: [{ upTo: 24_999_00, tax: 0 }, { upTo: null, tax: 200_00 }] },
  GUJARAT: { name: "Gujarat", slabs: [{ upTo: 11_999_00, tax: 0 }, { upTo: null, tax: 200_00 }] },
  WEST_BENGAL: {
    name: "West Bengal",
    slabs: [{ upTo: 10_000_00, tax: 0 }, { upTo: 15_000_00, tax: 110_00 }, { upTo: 25_000_00, tax: 130_00 }, { upTo: 40_000_00, tax: 150_00 }, { upTo: null, tax: 200_00 }],
  },
  TELANGANA: { name: "Telangana", slabs: [{ upTo: 15_000_00, tax: 0 }, { upTo: 20_000_00, tax: 150_00 }, { upTo: null, tax: 200_00 }] },
  ANDHRA_PRADESH: { name: "Andhra Pradesh", slabs: [{ upTo: 15_000_00, tax: 0 }, { upTo: 20_000_00, tax: 150_00 }, { upTo: null, tax: 200_00 }] },
};

export function professionalTax(state: string, gross: number, month: string) {
  const table = PT_STATES[state] || PT_STATES.NONE;
  const slab = table.slabs.find((s) => s.upTo === null || gross <= s.upTo)!;
  return month.endsWith("-02") && slab.feb !== undefined ? slab.feb : slab.tax;
}

/** ESI is worked out on gross and rounded up to the next rupee. */
const esi = (gross: number, rate: number) => Math.ceil((gross * rate) / 100 / 100) * 100;

export interface StatutoryProfile {
  pfApplicable: boolean;
  esiApplicable: boolean;
  monthlySalary: number;
  /** Professional tax is cut from staff salaries only. */
  professionalTax?: boolean;
}

/** Site workers' monthly wage for the ESI limit: 26 working days at the daily rate. */
export const LABOUR_MONTH_DAYS = 26;

/** PF, ESI and professional tax for one person's month. No profile means none. */
export function statutory(profile: StatutoryProfile | null | undefined, pay: { basePay: number; gross: number }, ptState: string, month: string) {
  if (!profile) return { pfEmployee: 0, pfEmployer: 0, esiEmployee: 0, esiEmployer: 0, professionalTax: 0 };
  const pfWage = Math.min(pay.basePay, PF_WAGE_CEILING);
  const pf = profile.pfApplicable ? Math.round((pfWage * PF_RATE) / 100) : 0;
  const esiCovered = profile.esiApplicable && profile.monthlySalary <= ESI_GROSS_LIMIT && pay.gross > 0;
  return {
    pfEmployee: pf,
    pfEmployer: pf,
    esiEmployee: esiCovered ? esi(pay.gross, ESI_EMPLOYEE_RATE) : 0,
    esiEmployer: esiCovered ? esi(pay.gross, ESI_EMPLOYER_RATE) : 0,
    professionalTax: pay.gross > 0 && profile.professionalTax !== false ? professionalTax(ptState, pay.gross, month) : 0,
  };
}

/** Payroll settings live in the organisation's settings: { payroll: { ptState } }. */
export async function payrollSettings(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settingsJson: true } });
  let settings: any = {};
  try {
    settings = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
  } catch {
    settings = {};
  }
  const ptState = settings.payroll?.ptState;
  return { ptState: typeof ptState === "string" && PT_STATES[ptState] ? ptState : "NONE" };
}

type Pay = { basePay: number; overtimePay: number; bonus: number; advanceDeduction: number; otherDeduction: number; tds: number };

function recompute(line: Pay, profile: StatutoryProfile | null | undefined, ptState: string, month: string) {
  const gross = line.basePay + line.overtimePay + line.bonus;
  const stat = statutory(profile, { basePay: line.basePay, gross }, ptState, month);
  const deductions = line.advanceDeduction + line.otherDeduction + line.tds + stat.pfEmployee + stat.esiEmployee + stat.professionalTax;
  return { gross, net: Math.max(0, gross - deductions), ...stat };
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
  profile?: StatutoryProfile | null;
  tax?: { regime: TaxRegime; declared: number } | null;
}

function labourProfile(m: { pfApplicable: boolean; esiApplicable: boolean }, rate: number): StatutoryProfile | null {
  if (!m.pfApplicable && !m.esiApplicable) return null;
  return { pfApplicable: m.pfApplicable, esiApplicable: m.esiApplicable, monthlySalary: rate * LABOUR_MONTH_DAYS, professionalTax: false };
}

/** Labour lines from site attendance. */
async function labourLines(organizationId: string, month: string): Promise<DraftLine[]> {
  const days = monthDays(month);
  const [members, sessions] = await Promise.all([
    prisma.workforceMember.findMany({
      where: { organizationId, isArchived: false, active: true },
      select: { id: true, name: true, workerType: true, dailyWageRate: true, pfApplicable: true, esiApplicable: true },
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
      profile: labourProfile(m, rate),
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
      profile: { pfApplicable: p.pfApplicable, esiApplicable: p.esiApplicable, monthlySalary: p.monthlySalary },
      tax: { regime: p.taxRegime === "OLD" ? "OLD" : "NEW", declared: p.taxDeclared },
    });
  }
  return lines;
}

type Ids = { uan: string | null; esicNumber: string | null; bankAccount: string | null; ifsc: string | null };

/** UAN, ESIC number and bank details for each person on a run, staff and site workers alike. */
async function statutoryIds(organizationId: string, lines: { personType: string; personId: string }[]) {
  const staff = lines.filter((l) => l.personType === "STAFF").map((l) => l.personId);
  const labour = lines.filter((l) => l.personType === "LABOUR").map((l) => l.personId);
  const [profiles, members] = await Promise.all([
    prisma.payrollProfile.findMany({ where: { organizationId, userId: { in: staff } } }),
    prisma.workforceMember.findMany({ where: { organizationId, id: { in: labour } }, select: { id: true, uan: true, esicNumber: true, bankAccount: true, ifsc: true } }),
  ]);
  const out = new Map<string, Ids>();
  profiles.forEach((p) => out.set(p.userId, { uan: p.uan, esicNumber: p.esicNumber, bankAccount: p.bankAccount, ifsc: p.ifsc }));
  members.forEach((m) => out.set(m.id, { uan: m.uan, esicNumber: m.esicNumber, bankAccount: m.bankAccount, ifsc: m.ifsc }));
  return out;
}

/** Staff pay, PF, PT and TDS in the financial year before `month`, per person. */
async function yearSoFar(organizationId: string, month: string, userIds: string[]) {
  const fy = fyMonths(fyOf(month));
  const lines = await prisma.payrollLine.findMany({
    where: { personType: "STAFF", personId: { in: userIds }, run: { organizationId, month: { gte: fy[0], lt: month } } },
    select: { personId: true, gross: true, pfEmployee: true, professionalTax: true, tds: true },
  });
  const out = new Map<string, YearSoFar>();
  for (const l of lines) {
    const y = out.get(l.personId) || { gross: 0, pf: 0, pt: 0, tds: 0 };
    out.set(l.personId, { gross: y.gross + l.gross, pf: y.pf + l.pfEmployee, pt: y.pt + l.professionalTax, tds: y.tds + l.tds });
  }
  return out;
}

const EMPTY_YEAR: YearSoFar = { gross: 0, pf: 0, pt: 0, tds: 0 };

/** TDS on a staff member's salary this month, from their regime and the year so far. */
function autoTds(tax: { regime: TaxRegime; declared: number }, earlier: YearSoFar, month: string, pay: { gross: number; pfEmployee: number; professionalTax: number }) {
  return monthlyTds({
    regime: tax.regime,
    declared: tax.declared,
    earlier,
    month: { gross: pay.gross, pf: pay.pfEmployee, pt: pay.professionalTax },
    monthsLeft: monthsLeftInFy(month),
  }).tds;
}

export const EPS_RATE = 8.33;

type RunLine = { personType: string; personId: string; personName: string; payableDays: number; basePay: number; gross: number; pfEmployee: number; esiEmployee: number };

/** Days with no PF: unpaid days for staff, days short of 26 for site workers. */
function ncpDays(l: RunLine, month: string) {
  const full = l.personType === "STAFF" ? monthDays(month).length : LABOUR_MONTH_DAYS;
  return Math.max(0, Math.round(full - l.payableDays));
}

const rupees = (paise: number) => Math.round(paise / 100);

/**
 * The monthly PF ECR text file for the EPFO portal and the ESI contribution
 * sheet for the ESIC portal. People missing a UAN or ESIC number are left out
 * and listed, so they can be added before filing.
 */
export function statutoryReturn(kind: "pf-ecr" | "esi", month: string, lines: RunLine[], ids: Map<string, Ids>) {
  const missing: string[] = [];
  if (kind === "pf-ecr") {
    const rows: string[] = [];
    for (const l of lines.filter((x) => x.pfEmployee > 0)) {
      const uan = ids.get(l.personId)?.uan?.trim();
      if (!uan) {
        missing.push(l.personName);
        continue;
      }
      const epfWages = rupees(Math.min(l.basePay, PF_WAGE_CEILING));
      const ee = rupees(l.pfEmployee);
      const eps = Math.round((epfWages * EPS_RATE) / 100);
      const name = l.personName.toUpperCase().replace(/[^A-Z .]/g, "").trim();
      rows.push([uan, name, rupees(l.gross), epfWages, epfWages, epfWages, ee, eps, ee - eps, ncpDays(l, month), 0].join("#~#"));
    }
    return { body: rows.join("\n"), missing, count: rows.length, filename: `pf-ecr_${month}.txt`, type: "text/plain" };
  }
  const head = ["IP Number", "IP Name", "No of Days for which wages paid/payable during the month", "Total Monthly Wages", "Reason Code for Zero workings days", "Last Working Day"];
  const rows: string[][] = [];
  for (const l of lines.filter((x) => x.esiEmployee > 0)) {
    const ip = ids.get(l.personId)?.esicNumber?.trim();
    if (!ip) {
      missing.push(l.personName);
      continue;
    }
    rows.push([ip, l.personName, String(Math.round(l.payableDays)), String(rupees(l.gross)), "", ""]);
  }
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return { body: [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n"), missing, count: rows.length, filename: `esi-contribution_${month}.csv`, type: "text/csv" };
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
    const sum = (k: "pfEmployee" | "pfEmployer" | "esiEmployee" | "esiEmployer" | "professionalTax" | "tds") => run.lines.reduce((s, l) => s + l[k], 0);
    return {
      ...run,
      statutory: {
        pfEmployee: sum("pfEmployee"),
        pfEmployer: sum("pfEmployer"),
        esiEmployee: sum("esiEmployee"),
        esiEmployer: sum("esiEmployer"),
        professionalTax: sum("professionalTax"),
        tds: sum("tds"),
      },
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
    const { ptState } = await payrollSettings(orgId);
    const monthEnd = monthDays(month).slice(-1)[0];

    // Keep manual bonus / deduction / note from the previous draft.
    const previous = existing ? await prisma.payrollLine.findMany({ where: { runId: existing.id } }) : [];
    const kept = new Map(previous.map((l) => [`${l.personType}:${l.personId}`, l]));
    const earlier = await yearSoFar(orgId, month, drafts.filter((d) => d.personType === "STAFF").map((d) => d.personId));

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
        const tdsManual = !!prev?.tdsManual;
        let tds = tdsManual ? prev!.tds : 0;
        if (!tdsManual && d.tax) {
          const pay = recompute({ basePay: d.basePay, overtimePay: d.overtimePay, bonus, advanceDeduction: 0, otherDeduction, tds: 0 }, d.profile, ptState, month);
          tds = Math.min(pay.net, autoTds(d.tax, earlier.get(d.personId) || EMPTY_YEAR, month, pay));
        }
        const before = recompute({ basePay: d.basePay, overtimePay: d.overtimePay, bonus, advanceDeduction: 0, otherDeduction, tds }, d.profile, ptState, month);
        let room = before.net;
        let advanceDeduction = 0;
        const recovered: string[] = [];
        for (const a of advances.filter((x) => x.personType === d.personType && x.personId === d.personId)) {
          if (a.amount <= room) {
            room -= a.amount;
            advanceDeduction += a.amount;
            recovered.push(a.id);
          }
        }
        const { profile: _profile, tax: _tax, ...lineData } = d;
        const { gross, net, ...stat } = recompute({ basePay: d.basePay, overtimePay: d.overtimePay, bonus, advanceDeduction, otherDeduction, tds }, d.profile, ptState, month);
        await tx.payrollLine.create({
          data: { runId: run.id, ...lineData, bonus, otherDeduction, tds, tdsManual, advanceDeduction, ...stat, gross, net, note: prev?.note || null },
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
  /** `tds` as a number fixes it by hand; `tds: null` goes back to working it out. */
  static async editLine(user: UserContext, lineId: string, input: { bonus?: number; otherDeduction?: number; tds?: number | null; note?: string | null }) {
    const line = await prisma.payrollLine.findFirst({ where: { id: lineId, run: { organizationId: user.organizationId } }, include: { run: true } });
    if (!line) throw new PayrollError("Payroll line not found", 404, "NOT_FOUND");
    if (line.run.status !== "DRAFT") throw new PayrollError("This payroll is locked. Only a draft can be changed.", 409, "PAYROLL_LOCKED");
    const next = {
      basePay: line.basePay,
      overtimePay: line.overtimePay,
      bonus: input.bonus ?? line.bonus,
      advanceDeduction: line.advanceDeduction,
      otherDeduction: input.otherDeduction ?? line.otherDeduction,
      tds: typeof input.tds === "number" ? input.tds : line.tds,
    };
    const tdsManual = typeof input.tds === "number" ? true : input.tds === null ? false : line.tdsManual;
    let profile: StatutoryProfile | null = null;
    const { ptState } = await payrollSettings(user.organizationId);
    if (line.personType === "STAFF") {
      const p = await prisma.payrollProfile.findUnique({ where: { organizationId_userId: { organizationId: user.organizationId, userId: line.personId } } });
      profile = p;
      if (!tdsManual && p) {
        const pay = recompute({ ...next, tds: 0 }, profile, ptState, line.run.month);
        const earlier = (await yearSoFar(user.organizationId, line.run.month, [line.personId])).get(line.personId) || EMPTY_YEAR;
        next.tds = Math.min(pay.net, autoTds({ regime: p.taxRegime === "OLD" ? "OLD" : "NEW", declared: p.taxDeclared }, earlier, line.run.month, pay));
      }
    } else {
      const m = await prisma.workforceMember.findFirst({ where: { id: line.personId, organizationId: user.organizationId } });
      profile = m ? labourProfile(m, line.rate) : null;
    }
    const { gross, net, ...stat } = recompute(next, profile, ptState, line.run.month);
    const deductions = next.advanceDeduction + next.otherDeduction + next.tds + stat.pfEmployee + stat.esiEmployee + stat.professionalTax;
    if (deductions > gross) throw new PayrollError("Deductions cannot be more than the pay.");
    await prisma.payrollLine.update({
      where: { id: lineId },
      data: { bonus: next.bonus, otherDeduction: next.otherDeduction, tds: next.tds, tdsManual, ...stat, gross, net, note: input.note === undefined ? line.note : input.note },
    });
    await refreshTotals(line.runId);
    return line.run.month;
  }

  /** An admin signs off the draft. */
  /**
   * On approval, the month's PF, ESI, professional tax and TDS become bills in
   * Finance, owed to the government, so they show as payables with their due
   * dates and are paid like any other bill.
   */
  static async postStatutoryBills(tx: any, user: UserContext, run: { id: string; month: string }) {
    const lines = await tx.payrollLine.findMany({ where: { runId: run.id } });
    const sum = (f: (l: any) => number) => lines.reduce((s: number, l: any) => s + f(l), 0);
    const [y, m] = run.month.split("-").map(Number);
    const next = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}`;
    const nextMonthEnd = monthDays(next).slice(-1)[0];
    const dues = [
      { key: "PF", party: "EPFO (Provident Fund)", amount: sum((l) => l.pfEmployee + l.pfEmployer), due: `${next}-15`, what: "PF, staff and company share" },
      { key: "ESI", party: "ESIC (Employees' State Insurance)", amount: sum((l) => l.esiEmployee + l.esiEmployer), due: `${next}-15`, what: "ESI, staff and company share" },
      { key: "TDS", party: "Income Tax Department (TDS on salary)", amount: sum((l) => l.tds), due: `${next}-07`, what: "TDS on salary, section 192" },
      { key: "PT", party: "Professional Tax (State)", amount: sum((l) => l.professionalTax), due: nextMonthEnd, what: "Professional tax" },
    ].filter((d) => d.amount > 0);
    const made: string[] = [];
    for (const d of dues) {
      let party = await tx.party.findFirst({ where: { organizationId: user.organizationId, name: d.party } });
      if (!party) party = await tx.party.create({ data: { organizationId: user.organizationId, partyType: "OTHER", name: d.party } });
      const billNumber = `${d.key}-${run.month}`;
      const exists = await tx.bill.findFirst({ where: { organizationId: user.organizationId, partyId: party.id, billNumber } });
      if (exists) continue;
      await tx.bill.create({
        data: {
          organizationId: user.organizationId,
          partyId: party.id,
          billNumber,
          billDate: new Date(`${monthDays(run.month).slice(-1)[0]}T12:00:00+05:30`),
          dueDate: new Date(`${d.due}T12:00:00+05:30`),
          totalAmount: d.amount,
          costHead: "OVERHEADS",
          status: "POSTED",
          notes: `${d.what} for ${run.month}, from payroll`,
          createdBy: user.userId,
          lines: { create: [{ description: `${d.what}, ${run.month}`, lineTotal: d.amount }] },
        },
      });
      made.push(billNumber);
    }
    return made;
  }

  static async approve(user: UserContext, month: string) {
    if (!isOrgOwnerOrAdmin(user)) throw new PayrollError("Only an admin can approve payroll.", 403, "FORBIDDEN");
    const run = await prisma.payrollRun.findUnique({ where: { organizationId_month: { organizationId: user.organizationId, month } } });
    if (!run) throw new PayrollError("Payroll not found", 404, "NOT_FOUND");
    if (run.status !== "DRAFT") throw new PayrollError(`Payroll is already ${run.status.toLowerCase()}.`, 409, "PAYROLL_LOCKED");
    await prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: "APPROVED", approvedBy: user.userId, approvedAt: new Date() } });
      const bills = await PayrollService.postStatutoryBills(tx, user, run);
      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "PAYROLL_APPROVED",
          entityType: "PAYROLL_RUN",
          entityId: run.id,
          afterJson: JSON.stringify({ month, totalNet: run.totalNet, statutoryBills: bills }),
        },
      });
    });
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
    const profile =
      line.personType === "STAFF"
        ? await prisma.payrollProfile.findUnique({ where: { organizationId_userId: { organizationId, userId: line.personId } }, select: { uan: true, esicNumber: true } })
        : null;
    return { ...line, organizationName: org?.name || "", projectName: project?.name || null, advances, uan: profile?.uan || null, esicNumber: profile?.esicNumber || null };
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
        pfApplicable: p?.pfApplicable || false,
        esiApplicable: p?.esiApplicable || false,
        uan: p?.uan || null,
        esicNumber: p?.esicNumber || null,
        taxRegime: p?.taxRegime || "NEW",
        taxDeclared: p?.taxDeclared || 0,
        bankAccountMasked: p?.bankAccount ? `••••${p.bankAccount.slice(-4)}` : null,
        ifsc: p?.ifsc || null,
      };
    });
  }

  static async saveProfile(
    user: UserContext,
    userId: string,
    input: {
      monthlySalary: number;
      bankAccount?: string | null;
      ifsc?: string | null;
      pfApplicable?: boolean;
      esiApplicable?: boolean;
      uan?: string | null;
      esicNumber?: string | null;
      taxRegime?: "NEW" | "OLD";
      taxDeclared?: number;
    }
  ) {
    const target = await prisma.user.findFirst({ where: { id: userId, organizationId: user.organizationId } });
    if (!target) throw new PayrollError("Staff member not found", 404, "NOT_FOUND");
    const data: any = { monthlySalary: Math.round(input.monthlySalary) };
    if (input.bankAccount !== undefined) data.bankAccount = input.bankAccount || null;
    if (input.ifsc !== undefined) data.ifsc = input.ifsc ? input.ifsc.toUpperCase() : null;
    if (input.pfApplicable !== undefined) data.pfApplicable = input.pfApplicable;
    if (input.esiApplicable !== undefined) data.esiApplicable = input.esiApplicable;
    if (input.uan !== undefined) data.uan = input.uan || null;
    if (input.esicNumber !== undefined) data.esicNumber = input.esicNumber || null;
    if (input.taxRegime !== undefined) data.taxRegime = input.taxRegime;
    if (input.taxDeclared !== undefined) data.taxDeclared = Math.round(input.taxDeclared);
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
        afterJson: JSON.stringify({ monthlySalary: data.monthlySalary, pfApplicable: data.pfApplicable, esiApplicable: data.esiApplicable }),
      },
    });
  }

  /** Site workers with their PF, ESI and bank details (account masked). */
  static async listWorkers(organizationId: string) {
    const members = await prisma.workforceMember.findMany({
      where: { organizationId, isArchived: false, active: true },
      select: { id: true, name: true, employeeCode: true, workerType: true, dailyWageRate: true, pfApplicable: true, esiApplicable: true, uan: true, esicNumber: true, bankAccount: true, ifsc: true },
      orderBy: { name: "asc" },
    });
    return members.map(({ bankAccount, ...m }) => ({ ...m, bankAccountMasked: bankAccount ? `••••${bankAccount.slice(-4)}` : null }));
  }

  static async saveWorker(
    user: UserContext,
    memberId: string,
    input: { pfApplicable?: boolean; esiApplicable?: boolean; uan?: string | null; esicNumber?: string | null; bankAccount?: string | null; ifsc?: string | null }
  ) {
    const m = await prisma.workforceMember.findFirst({ where: { id: memberId, organizationId: user.organizationId } });
    if (!m) throw new PayrollError("Worker not found", 404, "NOT_FOUND");
    const data: any = {};
    if (input.pfApplicable !== undefined) data.pfApplicable = input.pfApplicable;
    if (input.esiApplicable !== undefined) data.esiApplicable = input.esiApplicable;
    if (input.uan !== undefined) data.uan = input.uan || null;
    if (input.esicNumber !== undefined) data.esicNumber = input.esicNumber || null;
    if (input.bankAccount !== undefined) data.bankAccount = input.bankAccount || null;
    if (input.ifsc !== undefined) data.ifsc = input.ifsc ? input.ifsc.toUpperCase() : null;
    await prisma.workforceMember.update({ where: { id: m.id }, data });
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "WORKER_STATUTORY_UPDATED",
        entityType: "WORKFORCE_MEMBER",
        entityId: m.id,
        afterJson: JSON.stringify({ pfApplicable: data.pfApplicable, esiApplicable: data.esiApplicable, bankChanged: input.bankAccount !== undefined }),
      },
    });
  }

  /**
   * A staff member's salary and tax for a financial year: month by month what
   * was paid and deducted, and how the year's tax was worked out. A summary in
   * the shape of Form 16 Part B, not the form itself.
   */
  static async taxStatement(organizationId: string, userId: string, fy: string) {
    const months = fyMonths(fy);
    const [user, profile, lines, company] = await Promise.all([
      prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true, name: true, jobTitle: true, role: true } }),
      prisma.payrollProfile.findUnique({ where: { organizationId_userId: { organizationId, userId } } }),
      prisma.payrollLine.findMany({
        where: { personType: "STAFF", personId: userId, run: { organizationId, month: { gte: months[0], lte: months[11] } } },
        include: { run: { select: { month: true, status: true } } },
      }),
      companyProfile(organizationId),
    ]);
    if (!user) throw new PayrollError("Staff member not found", 404, "NOT_FOUND");
    const byMonth = new Map(lines.map((l) => [l.run.month, l]));
    const rows = months.map((m) => {
      const l = byMonth.get(m);
      return l
        ? { month: m, status: l.run.status, gross: l.gross, pf: l.pfEmployee, esi: l.esiEmployee, pt: l.professionalTax, tds: l.tds, tdsManual: l.tdsManual, net: l.net }
        : { month: m, status: null, gross: 0, pf: 0, esi: 0, pt: 0, tds: 0, tdsManual: false, net: 0 };
    });
    const sum = (k: "gross" | "pf" | "esi" | "pt" | "tds" | "net") => rows.reduce((s, r) => s + r[k], 0);
    const regime: TaxRegime = profile?.taxRegime === "OLD" ? "OLD" : "NEW";
    const last = [...rows].reverse().find((r) => r.status);
    // The rest of the year is assumed at the last month's pay.
    const lastIndex = last ? months.indexOf(last.month) : -1;
    const done = rows.slice(0, lastIndex + 1);
    const earlier = done.slice(0, -1).reduce((y, r) => ({ gross: y.gross + r.gross, pf: y.pf + r.pf, pt: y.pt + r.pt, tds: y.tds + r.tds }), { ...EMPTY_YEAR });
    const year = last
      ? projectYear({ regime, declared: profile?.taxDeclared || 0, earlier, month: { gross: last.gross, pf: last.pf, pt: last.pt }, monthsLeft: 12 - lastIndex })
      : projectYear({ regime, declared: profile?.taxDeclared || 0, earlier: EMPTY_YEAR, month: { gross: profile?.monthlySalary || 0, pf: 0, pt: 0 }, monthsLeft: 12 });
    return {
      fy,
      company,
      person: { ...user, uan: profile?.uan || null },
      regime,
      declared: profile?.taxDeclared || 0,
      rows,
      totals: { gross: sum("gross"), pf: sum("pf"), esi: sum("esi"), pt: sum("pt"), tds: sum("tds"), net: sum("net") },
      monthsPaid: done.filter((r) => r.status).length,
      projected: { ...year, complete: lastIndex === 11, tdsSoFar: sum("tds"), balance: Math.max(0, year.total - sum("tds")) },
    };
  }

  static async saveSettings(user: UserContext, input: { ptState: string }) {
    if (!PT_STATES[input.ptState]) throw new PayrollError("Pick a state for professional tax.");
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { settingsJson: true } });
    let settings: any = {};
    try {
      settings = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
    } catch {
      settings = {};
    }
    settings.payroll = { ...(settings.payroll || {}), ptState: input.ptState };
    await prisma.organization.update({ where: { id: user.organizationId }, data: { settingsJson: JSON.stringify(settings) } });
    await prisma.auditEvent.create({
      data: { organizationId: user.organizationId, actorUserId: user.userId, action: "PAYROLL_SETTINGS_UPDATED", entityType: "ORGANIZATION", entityId: user.organizationId, afterJson: JSON.stringify(settings.payroll) },
    });
  }

  /**
   * A bulk transfer sheet for the bank: one row per person with their account,
   * IFSC and net pay. People without bank details are listed last, to pay by
   * cash or cheque.
   */
  static async bankFile(user: UserContext, month: string) {
    const run = await prisma.payrollRun.findUnique({ where: { organizationId_month: { organizationId: user.organizationId, month } }, include: { lines: true } });
    if (!run) throw new PayrollError("Payroll not found", 404, "NOT_FOUND");
    if (run.status === "DRAFT") throw new PayrollError("Approve the payroll before making the bank file.", 409, "PAYROLL_NOT_APPROVED");
    const ids = await statutoryIds(user.organizationId, run.lines);
    const rows = run.lines
      .filter((l) => l.net > 0)
      .map((l) => {
        const p = ids.get(l.personId);
        return { name: l.personName, account: p?.bankAccount || "", ifsc: p?.ifsc || "", amount: (l.net / 100).toFixed(2), narration: `${l.personType === "LABOUR" ? "Wages" : "Salary"} ${month}` };
      })
      .sort((a, b) => Number(!a.account) - Number(!b.account) || a.name.localeCompare(b.name));
    await prisma.auditEvent.create({
      data: { organizationId: user.organizationId, actorUserId: user.userId, action: "PAYROLL_BANK_FILE", entityType: "PAYROLL_RUN", entityId: run.id, afterJson: JSON.stringify({ month, rows: rows.length }) },
    });
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    return [
      ["Beneficiary name", "Account number", "IFSC", "Amount", "Narration", "Note"].join(","),
      ...rows.map((r) => [r.name, r.account ? `'${r.account}` : "", r.ifsc, r.amount, r.narration, r.account ? "" : "No bank details: pay by cash or cheque"].map(cell).join(",")),
    ].join("\r\n");
  }

  /** PF ECR or ESI contribution file for an approved month. */
  static async statutoryFile(user: UserContext, month: string, kind: "pf-ecr" | "esi") {
    const run = await prisma.payrollRun.findUnique({ where: { organizationId_month: { organizationId: user.organizationId, month } }, include: { lines: true } });
    if (!run) throw new PayrollError("Payroll not found", 404, "NOT_FOUND");
    if (run.status === "DRAFT") throw new PayrollError("Approve the payroll before making the PF or ESI file.", 409, "PAYROLL_NOT_APPROVED");
    const file = statutoryReturn(kind, month, run.lines, await statutoryIds(user.organizationId, run.lines));
    await prisma.auditEvent.create({
      data: { organizationId: user.organizationId, actorUserId: user.userId, action: "PAYROLL_STATUTORY_FILE", entityType: "PAYROLL_RUN", entityId: run.id, afterJson: JSON.stringify({ month, kind, rows: file.count, missing: file.missing.length }) },
    });
    return file;
  }

  /** Who on the month's run is missing the UAN or ESIC number the filings need. */
  static async statutoryGaps(organizationId: string, month: string) {
    const run = await prisma.payrollRun.findUnique({ where: { organizationId_month: { organizationId, month } }, include: { lines: true } });
    if (!run) return { pf: [], esi: [] };
    const ids = await statutoryIds(organizationId, run.lines);
    return {
      pf: statutoryReturn("pf-ecr", month, run.lines, ids).missing,
      esi: statutoryReturn("esi", month, run.lines, ids).missing,
    };
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
