import { prisma } from "@/lib/db";
import { contractorPan } from "@/lib/contractor-tds";
import { rupeesInWords } from "@/lib/amount-words";
import { SECTION_80C_CAP, STANDARD_DEDUCTION, annualTax, fyMonths } from "@/lib/income-tax";
import { PayrollService } from "@/services/payroll-service";
import { assessmentYear } from "@/services/tds-certificates";

/**
 * Form 16 Part B for staff on salary, laid out line by line as in the form
 * (Annexure to Form 16, rule 31), from the year's payroll. Part A, with the
 * TRACES certificate number and the 24Q receipt numbers, comes only from
 * TRACES after the four 24Q returns are filed; the quarter summary here is for
 * checking it.
 */

/** Form 16 is due by 15 June after the year ends. */
export const form16DueDate = (fy: string) => `${Number(fy.slice(0, 4)) + 1}-06-15`;

/** Staff paid a salary in the year, for the list of Form 16s. */
export async function form16List(organizationId: string, fy: string) {
  const months = fyMonths(fy);
  const lines = await prisma.payrollLine.findMany({
    where: { personType: "STAFF", gross: { gt: 0 }, run: { organizationId, month: { gte: months[0], lte: months[11] }, status: { in: ["APPROVED", "PAID"] } } },
    select: { personId: true, personName: true, gross: true, tds: true },
  });
  const byPerson = new Map<string, { userId: string; name: string; gross: number; tds: number; months: number }>();
  for (const l of lines) {
    const row = byPerson.get(l.personId) || { userId: l.personId, name: l.personName, gross: 0, tds: 0, months: 0 };
    row.gross += l.gross;
    row.tds += l.tds;
    row.months += 1;
    byPerson.set(l.personId, row);
  }
  return { fy, due: form16DueDate(fy), staff: Array.from(byPerson.values()).sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function form16PartB(organizationId: string, userId: string, fy: string) {
  const [st, profile] = await Promise.all([
    PayrollService.taxStatement(organizationId, userId, fy),
    prisma.payrollProfile.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { pan: true } }),
  ]);
  const paid = st.rows.filter((r) => r.status === "APPROVED" || r.status === "PAID");
  if (!paid.length) return null;
  const company = st.company;
  const regime = st.regime;
  const p = st.projected;

  // Part B uses what was actually paid in the year; until March it is a draft on the payroll so far.
  const gross = paid.reduce((s, r) => s + r.gross, 0);
  const pf = paid.reduce((s, r) => s + r.pf, 0);
  const pt = paid.reduce((s, r) => s + r.pt, 0);
  const tdsDeducted = paid.reduce((s, r) => s + r.tds, 0);
  const standard = Math.min(gross, STANDARD_DEDUCTION[regime]);
  const taxOnEmployment = regime === "OLD" ? Math.min(pt, 2_500_00) : 0;
  const under16 = standard + taxOnEmployment;
  const salaryIncome = Math.max(0, gross - under16);
  const sec80C = regime === "OLD" ? Math.min(SECTION_80C_CAP, pf) : 0;
  const declared = regime === "OLD" ? Math.max(0, st.declared) : 0;
  const chapterVIA = Math.min(salaryIncome, sec80C + declared);
  const tax = annualTax(salaryIncome - chapterVIA, regime);

  // Quarter by quarter, as in Part A: salary paid, TDS deducted and the share deposited.
  const quarters = [];
  for (const q of [1, 2, 3, 4] as const) {
    const months = fyMonths(fy).slice((q - 1) * 3, q * 3);
    const rows = paid.filter((r) => months.includes(r.month));
    const tds = rows.reduce((s, r) => s + r.tds, 0);
    let deposited = 0;
    if (tds > 0) {
      const ret = await PayrollService.tdsReturn(organizationId, fy, q);
      for (const c of ret.challans) {
        const mine = ret.deductees.filter((d) => d.userId === userId && d.month === c.month).reduce((s, d) => s + d.tds, 0);
        if (mine && c.tds > 0) deposited += Math.min(mine, Math.round((mine * Math.min(c.deposited, c.tds)) / c.tds));
      }
    }
    quarters.push({ quarter: q, months, paid: rows.reduce((s, r) => s + r.gross, 0), tds, deposited });
  }

  const complete = st.rows[11].status === "APPROVED" || st.rows[11].status === "PAID";
  const pan = profile?.pan || null;
  const problems: string[] = [];
  if (!complete) problems.push("The year's payroll is not finished, so this is a draft on the months paid so far. Issue Form 16 after March's payroll is approved.");
  if (!company.tan) problems.push("Add the company TAN in Settings.");
  if (!pan) problems.push(`No PAN for ${st.person.name}. Add it under Staff salaries.`);
  if (!company.tdsSignatory) problems.push("Add who signs TDS certificates in Settings.");
  if (quarters.some((q) => q.deposited < q.tds)) problems.push("Some of this TDS is not deposited yet. Deposit it before issuing Form 16.");
  if (tax.total > tdsDeducted) {
    const short = Math.round((tax.total - tdsDeducted) / 100).toLocaleString("en-IN");
    problems.push(complete ? `TDS is ${short} rupees short of the tax for the year. The employee pays it with their return.` : `Tax for the year is ${short} rupees more than the TDS deducted so far. Deduct the rest before March.`);
  }

  return {
    fy,
    assessmentYear: assessmentYear(fy),
    due: form16DueDate(fy),
    complete,
    certificateNumber: `16B/${fy}/${userId.slice(0, 6).toUpperCase()}`,
    employer: {
      name: company.name,
      address: company.address,
      tan: company.tan,
      pan: contractorPan({ taxIdentifier: company.gstin }),
      signatory: company.tdsSignatory,
      designation: company.tdsSignatoryDesignation,
    },
    employee: { id: st.person.id, name: st.person.name, designation: st.person.jobTitle || st.person.role.replace(/_/g, " ").toLowerCase(), pan },
    period: { from: `${fy.slice(0, 4)}-04-01`, to: `${Number(fy.slice(0, 4)) + 1}-03-31` },
    optedOutOf115BAC: regime === "OLD",
    quarters,
    // Line numbers as printed on Form 16 Part B.
    partB: {
      salary17_1: gross,
      perquisites17_2: 0,
      profits17_3: 0,
      grossSalary: gross,
      otherEmployers: 0,
      exempt10: 0,
      fromThisEmployer: gross,
      standardDeduction: standard,
      entertainment: 0,
      taxOnEmployment,
      totalUnder16: under16,
      chargeableSalary: salaryIncome,
      otherIncome: 0,
      grossTotalIncome: salaryIncome,
      sec80C,
      otherVIA: declared,
      totalVIA: chapterVIA,
      totalIncome: tax.taxable,
      taxOnIncome: tax.slabTax,
      rebate87A: tax.rebate,
      surcharge: tax.surcharge,
      cess: tax.cess,
      taxPayable: tax.total,
      relief89: 0,
      netTaxPayable: tax.total,
      tdsDeducted,
      balance: tax.total - tdsDeducted,
    },
    projectedTax: p.total,
    tdsInWords: `Rupees ${rupeesInWords(Math.round(tdsDeducted / 100))} only`,
    problems,
  };
}
