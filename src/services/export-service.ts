import { prisma } from "@/lib/db";
import { bankAmount, paymentSection } from "@/lib/contractor-tds";
import { istDayBounds } from "@/lib/ist-date";
import { inferBillHead, inferPaymentHead, type CostHead } from "@/services/project-budget-service";
import { companyProfile } from "@/services/sales-service";

/**
 * Exports for the accountant: a Tally import file (vouchers plus the ledgers
 * they use) and CSV registers for GST returns. Amounts are stored in paise
 * and written in rupees with two decimals.
 */

export type ExportPart = "bills" | "payments" | "receipts";

const rs = (paise: number) => (Math.round(paise) / 100).toFixed(2);
const tallyDate = (d: string) => d.replace(/-/g, "");
const istKey = (d: Date) => new Date(d.getTime() + 19_800_000).toISOString().slice(0, 10);

/** Ledger names and the Tally group each one is created under. */
const HEAD_LEDGER: Record<CostHead, { name: string; group: string }> = {
  MATERIAL: { name: "Purchase - Construction Material", group: "Purchase Accounts" },
  LABOUR: { name: "Wages - Site Labour", group: "Direct Expenses" },
  CONTRACTOR: { name: "Contractor Charges", group: "Direct Expenses" },
  EQUIPMENT: { name: "Machinery Hire Charges", group: "Direct Expenses" },
  DESIGN: { name: "Architect & Consultancy Fees", group: "Direct Expenses" },
  APPROVALS: { name: "Approval & Statutory Fees", group: "Indirect Expenses" },
  OVERHEADS: { name: "Salaries & Site Overheads", group: "Indirect Expenses" },
  OTHER: { name: "Other Construction Expenses", group: "Direct Expenses" },
};
const SALES_LEDGER = "Sales - Units Under Construction";
const CGST = "Output CGST";
const SGST = "Output SGST";

function xml(v: string | number | null | undefined) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/** Tally's sign rule: a debit is "deemed positive" and written as a negative amount. */
function entry(ledger: string, paise: number, debit: boolean) {
  const amount = debit ? `-${rs(paise)}` : rs(paise);
  return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${amount}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
}

function voucher(v: { type: string; date: string; number: string; reference?: string | null; narration: string; party?: string | null; entries: string[] }) {
  return [
    `<VOUCHER VCHTYPE="${v.type}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `<DATE>${tallyDate(v.date)}</DATE>`,
    `<VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME>`,
    `<VOUCHERNUMBER>${xml(v.number)}</VOUCHERNUMBER>`,
    v.reference ? `<REFERENCE>${xml(v.reference)}</REFERENCE>` : "",
    v.party ? `<PARTYLEDGERNAME>${xml(v.party)}</PARTYLEDGERNAME>` : "",
    `<NARRATION>${xml(v.narration)}</NARRATION>`,
    ...v.entries,
    `</VOUCHER>`,
  ].join("");
}

function ledger(name: string, group: string) {
  return `<LEDGER NAME="${xml(name)}" ACTION="Create"><NAME.LIST><NAME>${xml(name)}</NAME></NAME.LIST><PARENT>${xml(group)}</PARENT></LEDGER>`;
}

const customerLedger = (b: { customerName: string; unit: { unitNumber: string } }) => `${b.customerName} (${b.unit.unitNumber})`;
const paidFrom = (p: { payingAccount: string | null; method: string }) => p.payingAccount?.trim() || (p.method === "CASH" ? "Cash" : "Bank Account");

export function csv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? "");
          // Keep spreadsheet apps from treating text as a formula.
          const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(",")
    )
    .join("\r\n");
}

async function loadBills(organizationId: string, from: string, to: string) {
  return prisma.bill.findMany({
    where: { organizationId, status: "POSTED", isArchived: false, billDate: { gte: istDayBounds(from).start, lte: istDayBounds(to).end } },
    include: {
      party: { select: { name: true, partyType: true, taxIdentifier: true, panNumber: true } },
      project: { select: { name: true } },
      lines: { select: { materialId: true, gstRate: true } },
      allocations: { where: { reversedAt: null, payment: { status: "POSTED" } }, select: { amount: true } },
    },
    orderBy: { billDate: "asc" },
  });
}

async function loadPayments(organizationId: string, from: string, to: string) {
  return prisma.payment.findMany({
    where: { organizationId, status: "POSTED", isArchived: false, paymentDate: { gte: istDayBounds(from).start, lte: istDayBounds(to).end } },
    include: {
      party: { select: { name: true, partyType: true } },
      project: { select: { name: true } },
      allocations: { where: { reversedAt: null }, select: { bill: { select: { statutory: true } } } },
    },
    orderBy: { paymentDate: "asc" },
  });
}

async function loadReceipts(organizationId: string, from: string, to: string) {
  return prisma.salesReceipt.findMany({
    where: { organizationId, date: { gte: from, lte: to }, cancelledAt: null, booking: { status: "ACTIVE" } },
    include: {
      booking: { select: { bookingNumber: true, customerName: true, customerPhone: true, gstRate: true, unit: { select: { unitNumber: true, unitType: true, project: { select: { name: true } } } } } },
      installment: { select: { label: true } },
    },
    orderBy: [{ date: "asc" }, { receiptNumber: "asc" }],
  });
}

/** TDS held back on payments, one ledger per act (194C, 194J, 194I, 194Q), until it is deposited. */
const tdsLedger = (act: string) => `TDS Payable (${act})`;
const TDS_BILL = /^TDS_(19\d[A-Z]?)$/;

const INPUT_TAX = { cgst: "Input CGST", sgst: "Input SGST", igst: "Input IGST" } as const;
const RCM_TAX = { cgst: "CGST Payable (RCM)", sgst: "SGST Payable (RCM)", igst: "IGST Payable (RCM)" } as const;

type BillTax = {
  totalAmount: number;
  taxableAmount: number | null;
  cgst: number;
  sgst: number;
  igst: number;
  itcEligible: boolean;
  reverseCharge: boolean;
  party: { name: string };
};

/**
 * Dr expense for the taxable value, Dr input GST when the credit can be
 * claimed (otherwise the tax is part of the cost), Cr the supplier.
 * Under reverse charge the supplier is owed the taxable value only and the
 * tax is credited to an RCM payable ledger, to be paid to the government.
 */
function purchaseEntries(b: BillTax, expense: string, need: (name: string, group: string) => void) {
  const tax = b.cgst + b.sgst + b.igst;
  if (!tax || b.taxableAmount == null) {
    return [entry(expense, b.totalAmount, true), entry(b.party.name, b.totalAmount, false)];
  }
  const out = [entry(expense, b.itcEligible ? b.taxableAmount : b.taxableAmount + tax, true)];
  for (const k of ["cgst", "sgst", "igst"] as const) {
    if (!b[k]) continue;
    if (b.itcEligible) {
      need(INPUT_TAX[k], "Duties & Taxes");
      out.push(entry(INPUT_TAX[k], b[k], true));
    }
    if (b.reverseCharge) {
      need(RCM_TAX[k], "Duties & Taxes");
      out.push(entry(RCM_TAX[k], b[k], false));
    }
  }
  out.push(entry(b.party.name, b.totalAmount, false));
  return out;
}

/** "18" for a one-rate bill, "5/18" when lines differ. */
function billRates(b: { gstRate: number | null; lines: { gstRate: number | null }[] }) {
  if (b.gstRate == null) return "";
  const rates = Array.from(new Set(b.lines.map((l) => l.gstRate).filter((r): r is number => r != null))).sort((x, y) => x - y);
  return rates.length ? rates.join("/") : String(b.gstRate);
}

export class ExportService {
  /** Counts and totals for the export page, so the accountant sees what is in the file. */
  static async summary(organizationId: string, from: string, to: string) {
    const [bills, payments, receipts] = await Promise.all([loadBills(organizationId, from, to), loadPayments(organizationId, from, to), loadReceipts(organizationId, from, to)]);
    return {
      bills: { count: bills.length, amount: bills.reduce((s, b) => s + b.totalAmount, 0) },
      payments: { count: payments.length, amount: payments.reduce((s, p) => s + p.amount, 0) },
      receipts: {
        count: receipts.length,
        amount: receipts.reduce((s, r) => s + r.amount, 0),
        taxable: receipts.reduce((s, r) => s + r.taxableAmount, 0),
        gst: receipts.reduce((s, r) => s + r.gstAmount, 0),
      },
    };
  }

  /** One XML file for Tally (Gateway of Tally → Import → Vouchers). */
  static async tallyXml(organizationId: string, from: string, to: string, parts: ExportPart[]) {
    const company = await companyProfile(organizationId);
    const ledgers = new Map<string, string>();
    const vouchers: string[] = [];
    const need = (name: string, group: string) => {
      if (!ledgers.has(name)) ledgers.set(name, group);
    };

    if (parts.includes("bills")) {
      for (const b of await loadBills(organizationId, from, to)) {
        // TDS bills are credited to their ledger in the payment voucher, not bought.
        if (b.statutory && TDS_BILL.test(b.statutory)) continue;
        const head = HEAD_LEDGER[inferBillHead(b)];
        need(b.party.name, "Sundry Creditors");
        need(head.name, head.group);
        vouchers.push(
          voucher({
            type: "Purchase",
            date: istKey(b.billDate),
            number: b.billNumber,
            reference: b.billNumber,
            party: b.party.name,
            narration: [`Bill ${b.billNumber} from ${b.party.name}`, b.project?.name, b.notes].filter(Boolean).join(" · "),
            entries: purchaseEntries(b, head.name, need),
          })
        );
      }
    }

    if (parts.includes("payments")) {
      for (const p of await loadPayments(organizationId, from, to)) {
        const head = HEAD_LEDGER[inferPaymentHead(p)];
        // Paid against a supplier's account, or straight to an expense (wages, petty cash).
        // Depositing TDS clears that act's TDS ledger instead.
        const depositActs = new Set(p.allocations.map((a) => TDS_BILL.exec(a.bill.statutory ?? "")?.[1] ?? ""));
        const depositAct = p.allocations.length > 0 && depositActs.size === 1 ? [...depositActs][0] : "";
        const debit = depositAct ? tdsLedger(depositAct) : p.party ? p.party.name : head.name;
        const heldLedger = tdsLedger(paymentSection(p.tdsSection)?.act ?? "194C");
        if (depositAct) need(debit, "Duties & Taxes");
        else if (p.party) need(p.party.name, "Sundry Creditors");
        else need(head.name, head.group);
        const credit = paidFrom(p);
        need(credit, p.method === "CASH" && !p.payingAccount ? "Cash-in-Hand" : "Bank Accounts");
        if (p.tdsAmount > 0) need(heldLedger, "Duties & Taxes");
        vouchers.push(
          voucher({
            type: "Payment",
            date: istKey(p.paymentDate),
            number: p.referenceNumber,
            reference: p.referenceNumber,
            party: debit,
            narration: [`Paid ${p.recipientName || p.party?.name || "payee"} by ${p.method.replace(/_/g, " ")}`, p.project?.name, p.notes].filter(Boolean).join(" · "),
            entries: [
              entry(debit, p.amount, true),
              entry(credit, bankAmount(p), false),
              ...(p.tdsAmount > 0 ? [entry(heldLedger, p.tdsAmount, false)] : []),
            ],
          })
        );
      }
    }

    if (parts.includes("receipts")) {
      const receipts = await loadReceipts(organizationId, from, to);
      if (receipts.length) need(SALES_LEDGER, "Sales Accounts");
      for (const r of receipts) {
        const cust = customerLedger(r.booking);
        need(cust, "Sundry Debtors");
        const bank = r.mode === "CASH" ? "Cash" : "Bank Account";
        need(bank, r.mode === "CASH" ? "Cash-in-Hand" : "Bank Accounts");
        const cgst = Math.floor(r.gstAmount / 2);
        const sgst = r.gstAmount - cgst;
        if (r.gstAmount) {
          need(CGST, "Duties & Taxes");
          need(SGST, "Duties & Taxes");
        }
        const what = `${r.installment.label}, unit ${r.booking.unit.unitNumber}, ${r.booking.unit.project.name} (booking ${r.booking.bookingNumber})`;
        // GST on an under-construction unit is due when the money comes in, so each receipt is also the tax invoice.
        vouchers.push(
          voucher({
            type: "Sales",
            date: r.date,
            number: r.receiptNumber,
            party: cust,
            narration: `Tax invoice against receipt ${r.receiptNumber}: ${what}`,
            entries: [
              entry(cust, r.amount, true),
              entry(SALES_LEDGER, r.taxableAmount, false),
              ...(r.gstAmount ? [entry(CGST, cgst, false), entry(SGST, sgst, false)] : []),
            ],
          }),
          voucher({
            type: "Receipt",
            date: r.date,
            number: r.receiptNumber,
            reference: r.reference,
            party: cust,
            narration: `Received by ${r.mode.replace(/_/g, " ")}${r.reference ? ` ref ${r.reference}` : ""}: ${what}`,
            entries: [entry(bank, r.amount, true), entry(cust, r.amount, false)],
          })
        );
      }
    }

    const masters = Array.from(ledgers.entries()).map(([name, group]) => `<TALLYMESSAGE xmlns:UDF="TallyUDF">${ledger(name, group)}</TALLYMESSAGE>`);
    const body = vouchers.map((v) => `<TALLYMESSAGE xmlns:UDF="TallyUDF">${v}</TALLYMESSAGE>`);
    return {
      voucherCount: vouchers.length,
      xml: [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<ENVELOPE>`,
        `<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>`,
        `<BODY><IMPORTDATA>`,
        `<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(company.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>`,
        `<REQUESTDATA>`,
        ...masters,
        ...body,
        `</REQUESTDATA>`,
        `</IMPORTDATA></BODY>`,
        `</ENVELOPE>`,
      ].join("\n"),
    };
  }

  /** Customer receipts with the GST split, for GSTR-1 and GSTR-3B. */
  static async gstSalesCsv(organizationId: string, from: string, to: string) {
    const rows = await loadReceipts(organizationId, from, to);
    const cgst = (r: { gstAmount: number }) => Math.floor(r.gstAmount / 2);
    const total = (k: "taxableAmount" | "gstAmount" | "amount") => rs(rows.reduce((s, r) => s + r[k], 0));
    return csv([
      ["Date", "Receipt / invoice no.", "Customer", "Mobile", "Unit", "Unit type", "Project", "Booking", "For", "Taxable value", "GST rate %", "CGST", "SGST", "Total received", "Mode", "Reference"],
      ...rows.map((r) => [
        r.date,
        r.receiptNumber,
        r.booking.customerName,
        r.booking.customerPhone,
        r.booking.unit.unitNumber,
        r.booking.unit.unitType,
        r.booking.unit.project.name,
        r.booking.bookingNumber,
        r.installment.label,
        rs(r.taxableAmount),
        r.booking.gstRate,
        rs(cgst(r)),
        rs(r.gstAmount - cgst(r)),
        rs(r.amount),
        r.mode.replace(/_/g, " "),
        r.reference,
      ]),
      ["Total", "", "", "", "", "", "", "", "", total("taxableAmount"), "", rs(rows.reduce((s, r) => s + cgst(r), 0)), rs(rows.reduce((s, r) => s + r.gstAmount - cgst(r), 0)), total("amount"), "", ""],
    ]);
  }

  /** Supplier bills with GSTIN, for matching input tax credit against GSTR-2B. */
  static async purchasesCsv(organizationId: string, from: string, to: string) {
    const rows = await loadBills(organizationId, from, to);
    const isGstin = (v: string | null) => !!v && /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i.test(v.trim());
    return csv([
      ["Bill date", "Bill no.", "Supplier", "GSTIN", "PAN", "Project", "Cost head", "Taxable value", "GST rate %", "CGST", "SGST", "IGST", "ITC", "Reverse charge", "Bill amount", "Paid", "Balance", "Due date"],
      ...rows.map((b) => {
        const paid = b.allocations.reduce((s, a) => s + a.amount, 0);
        return [
          istKey(b.billDate),
          b.billNumber,
          b.party.name,
          isGstin(b.party.taxIdentifier) ? b.party.taxIdentifier!.trim().toUpperCase() : "",
          b.party.panNumber || (!isGstin(b.party.taxIdentifier) ? b.party.taxIdentifier : "") || "",
          b.project?.name,
          HEAD_LEDGER[inferBillHead(b)].name,
          rs(b.taxableAmount ?? b.totalAmount),
          billRates(b),
          rs(b.cgst),
          rs(b.sgst),
          rs(b.igst),
          b.gstRate == null ? "" : b.itcEligible ? "Yes" : "No",
          b.reverseCharge ? "Yes" : "",
          rs(b.totalAmount),
          rs(paid),
          rs(b.totalAmount - paid),
          b.dueDate ? istKey(b.dueDate) : "",
        ];
      }),
      [
        "Total", "", "", "", "", "", "",
        rs(rows.reduce((s, b) => s + (b.taxableAmount ?? b.totalAmount), 0)),
        "",
        rs(rows.reduce((s, b) => s + b.cgst, 0)),
        rs(rows.reduce((s, b) => s + b.sgst, 0)),
        rs(rows.reduce((s, b) => s + b.igst, 0)),
        "",
        "",
        rs(rows.reduce((s, b) => s + b.totalAmount, 0)),
        "", "", "",
      ],
    ]);
  }

  /** Every posted payment, for the bank reconciliation. */
  static async paymentsCsv(organizationId: string, from: string, to: string) {
    const rows = await loadPayments(organizationId, from, to);
    return csv([
      ["Date", "Reference", "Paid to", "Type", "Project", "Cost head", "Method", "Paid from", "Amount", "TDS held", "From bank"],
      ...rows.map((p) => [
        istKey(p.paymentDate),
        p.referenceNumber,
        p.recipientName || p.party?.name || "",
        p.recipientType || p.party?.partyType || "",
        p.project?.name,
        HEAD_LEDGER[inferPaymentHead(p)].name,
        p.method.replace(/_/g, " "),
        paidFrom(p),
        rs(p.amount),
        p.tdsAmount ? rs(p.tdsAmount) : "",
        rs(bankAmount(p)),
      ]),
      [
        "Total", "", "", "", "", "", "", "",
        rs(rows.reduce((s, p) => s + p.amount, 0)),
        rs(rows.reduce((s, p) => s + p.tdsAmount, 0)),
        rs(rows.reduce((s, p) => s + bankAmount(p), 0)),
      ],
    ]);
  }
}
