import { prisma } from "@/lib/db";
import { contractorPan } from "@/lib/contractor-tds";
import { companyProfile } from "@/lib/company";
import { rupeesInWords } from "@/lib/amount-words";
import { FinanceService } from "@/services/finance-service";

/**
 * TDS certificates for parties (Form 16A), one per party per quarter, made
 * from the same figures as the 26Q return: each payment with TDS, and the
 * challans that deposited it.
 *
 * The certificate a party can claim credit with is the one downloaded from
 * TRACES after the 26Q is filed, which carries the TRACES certificate number.
 * This one lets the office send the figures straight away and check TRACES
 * against them.
 */

/** Form 16A is due 15 days after the 26Q due date. */
export function form16ADueDate(fy: string, quarter: 1 | 2 | 3 | 4) {
  const start = Number(fy.slice(0, 4));
  return [`${start}-08-15`, `${start}-11-15`, `${start + 1}-02-15`, `${start + 1}-06-15`][quarter - 1];
}

/** Assessment year for a financial year: 2026-27 → 2027-28. */
export function assessmentYear(fy: string) {
  const y = Number(fy.slice(0, 4)) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

const quarterPeriod = (fy: string, q: 1 | 2 | 3 | 4) => {
  const y = Number(fy.slice(0, 4));
  return [
    { from: `${y}-04-01`, to: `${y}-06-30` },
    { from: `${y}-07-01`, to: `${y}-09-30` },
    { from: `${y}-10-01`, to: `${y}-12-31` },
    { from: `${y + 1}-01-01`, to: `${y + 1}-03-31` },
  ][q - 1];
};

/** Parties with TDS held back in the quarter, for the list of certificates. */
export async function form16AList(organizationId: string, fy: string, quarter: 1 | 2 | 3 | 4) {
  const ret = await FinanceService.contractorTdsReturn(organizationId, fy, quarter);
  const byParty = new Map<string, { partyId: string; name: string; pan: string | null; sections: Set<string>; paid: number; tds: number; payments: number }>();
  for (const d of ret.deductees) {
    if (!d.partyId || d.tds <= 0) continue;
    const row = byParty.get(d.partyId) || { partyId: d.partyId, name: d.name, pan: d.pan, sections: new Set<string>(), paid: 0, tds: 0, payments: 0 };
    row.sections.add(d.section);
    row.paid += d.amountPaid;
    row.tds += d.tds;
    row.payments += 1;
    byParty.set(d.partyId, row);
  }
  return {
    fy,
    quarter,
    due: form16ADueDate(fy, quarter),
    parties: Array.from(byParty.values())
      .map((r) => ({ ...r, sections: Array.from(r.sections) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** One party's certificate for the quarter, or null when nothing was held back from them. */
export async function form16A(organizationId: string, fy: string, quarter: 1 | 2 | 3 | 4, partyId: string) {
  const party = await prisma.party.findFirst({
    where: { id: partyId, organizationId },
    select: { id: true, name: true, address: true, city: true, panNumber: true, taxIdentifier: true, whatsappNumber: true, phone: true },
  });
  if (!party) return null;
  const [ret, company] = await Promise.all([FinanceService.contractorTdsReturn(organizationId, fy, quarter), companyProfile(organizationId)]);
  const payments = ret.deductees.filter((d) => d.partyId === party.id && d.tds > 0);
  if (!payments.length) return null;

  // The challans that carried this party's TDS: their section's deposit for the month.
  const challans = [];
  for (const key of Array.from(new Set(payments.map((p) => `${p.section}|${p.month}`)))) {
    const [section, month] = key.split("|");
    const c = ret.challans.find((x) => x.section === section && x.month === month);
    const tds = payments.filter((p) => p.section === section && p.month === month).reduce((s, p) => s + p.tds, 0);
    challans.push({
      section,
      month,
      tds,
      // A challan paid in part covers the party's share in proportion.
      deposited: c && c.tds > 0 ? Math.min(tds, Math.round((tds * Math.min(c.deposited, c.tds)) / c.tds)) : 0,
      depositedOn: c?.depositedOn || null,
      reference: c?.reference || null,
      state: c?.state || "NOT_PAID",
    });
  }
  const totals = {
    paid: payments.reduce((s, p) => s + p.amountPaid, 0),
    tds: payments.reduce((s, p) => s + p.tds, 0),
    deposited: challans.reduce((s, c) => s + c.deposited, 0),
  };
  const problems: string[] = [];
  if (!company.tan) problems.push("Add the company TAN in Settings.");
  if (!contractorPan(party)) problems.push(`No PAN for ${party.name}. Without it the party cannot claim the TDS.`);
  if (totals.deposited < totals.tds) problems.push("Some of this TDS is not deposited yet. Deposit it before sending the certificate.");
  if (!company.tdsSignatory) problems.push("Add who signs TDS certificates in Settings.");

  return {
    fy,
    quarter,
    assessmentYear: assessmentYear(fy),
    period: quarterPeriod(fy, quarter),
    due: form16ADueDate(fy, quarter),
    certificateNumber: `16A/${fy}/Q${quarter}/${party.id.slice(0, 6).toUpperCase()}`,
    deductor: {
      name: company.name,
      address: company.address,
      tan: company.tan,
      pan: contractorPan({ taxIdentifier: company.gstin }),
      signatory: company.tdsSignatory,
      designation: company.tdsSignatoryDesignation,
    },
    deductee: {
      id: party.id,
      name: party.name,
      address: [party.address, party.city].filter(Boolean).join(", ") || null,
      pan: contractorPan(party),
      whatsapp: party.whatsappNumber || party.phone || null,
    },
    payments: payments.map((p) => ({ paidOn: p.paidOn, section: p.section, sectionCode: p.sectionCode, sectionLabel: p.sectionLabel, amountPaid: p.amountPaid, rate: p.rate, tds: p.tds, reference: p.reference })),
    challans,
    totals,
    tdsInWords: `Rupees ${rupeesInWords(Math.round(totals.tds / 100))} only`,
    problems,
  };
}
