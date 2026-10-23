import { prisma } from "@/lib/db";
import { contractorPan, fyStartOf, partySection, paymentSection, sectionsOf, tdsDueDate, TDS_ACTS, TDS_SECTIONS, workTds, type TdsAct, type TdsMode, type TdsResult } from "@/lib/contractor-tds";
import { istDateKey, istDayBounds } from "@/lib/ist-date";
import { fyMonths } from "@/lib/income-tax";
import { challanProblems, returnDueDate, tdsChallans } from "@/services/tds-challans";
import { assertPermission, Role } from "@/lib/permissions";
import { roundPaise } from "@/lib/financial-math";
import { companyProfile, gstStateCode } from "@/lib/company";

export interface BillLineInput {
  description: string;
  materialId?: string;
  quantity?: number;
  unitRate?: number; // paise
  lineTotal: number; // paise, before GST
  gstRate?: number | null; // % for this line, when it differs from the bill's rate
}

export interface CreateBillInput {
  organizationId: string;
  partyId: string;
  projectId?: string;
  billNumber: string;
  billDate: Date;
  dueDate?: Date;
  lines: BillLineInput[];
  notes?: string;
  costHead?: string | null;
  /**
   * GST on top of the lines. Supplier in another state → IGST, else CGST + SGST.
   * `rate` applies to lines without their own rate. Under reverse charge the
   * supplier is paid the lines only and we pay the GST to the government.
   */
  gst?: { rate?: number | null; interState?: boolean | null; itcEligible?: boolean; reverseCharge?: boolean } | null;
  userId: string;
  role: Role;
}

export const BILL_GST_RATES = [0, 5, 12, 18, 28];

/**
 * Splits GST on a bill. When interState is not given it is worked out from
 * the first two digits of the supplier's and the company's GSTIN.
 */
export function billGst(taxable: number, rate: number, interState: boolean) {
  const tax = roundPaise((taxable * rate) / 100);
  if (interState) return { cgst: 0, sgst: 0, igst: tax, tax };
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0, tax };
}

export interface PaymentAllocationInput {
  billId: string;
  amount: number; // paise
}

export interface RecordPaymentInput {
  organizationId: string;
  partyId?: string;
  recipientType?: string; // VENDOR, CONTRACTOR, EMPLOYEE
  recipientName?: string;
  payingAccount?: string; // Source bank/cash account
  approvalQuery?: string; // Reason or query submitted for Super Admin approval
  projectId?: string;
  paymentDate: Date;
  amount: number; // paise
  currency?: string;
  method: string; // BANK_TRANSFER, UPI, CASH, CHEQUE, NEFT_RTGS
  referenceNumber: string;
  idempotencyKey: string;
  allocations?: PaymentAllocationInput[];
  notes?: string;
  costHead?: string | null;
  userId: string;
  role: Role;
  autoApprove?: boolean;
  status?: string;
  /** TDS on a contractor payment: worked out (AUTO, the default), none with a reason, or typed in. */
  tds?: { mode: TdsMode; amount?: number; reason?: string | null } | null;
}

export interface ReversePaymentInput {
  organizationId: string;
  paymentId: string;
  reason: string;
  userId: string;
  role: Role;
}

const TDS_PARTY = "Income Tax Department (TDS)";
const OLD_TDS_PARTY = "Income Tax Department (TDS on contractors)"; // name used before 194J and 194I
const ACT_TEXT: Record<TdsAct, string> = {
  "194C": "TDS on contractor payments (section 194C)",
  "194J": "TDS on professional and technical fees (section 194J)",
  "194I": "TDS on rent (section 194I)",
  "194Q": "TDS on purchase of goods (section 194Q)",
};

/**
 * Keeps each month's "TDS owed" bills (one per section: 194C, 194J, 194I, 194Q)
 * equal to the TDS held back from posted payments that month, so it shows
 * as owed in Finance until it is deposited.
 */
export async function syncTdsBills(tx: any, organizationId: string, month: string, userId: string) {
  const { start } = istDayBounds(`${month}-01`);
  const [y, m] = month.split("-").map(Number);
  const end = istDayBounds(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)).end;
  let party = await tx.party.findFirst({ where: { organizationId, name: { in: [TDS_PARTY, OLD_TDS_PARTY] } } });
  for (const act of TDS_ACTS) {
    const held = await tx.payment.aggregate({
      where: { organizationId, status: "POSTED", reversedAt: null, tdsAmount: { gt: 0 }, tdsSection: { in: sectionsOf(act) }, paymentDate: { gte: start, lte: end } },
      _sum: { tdsAmount: true },
    });
    const total = Math.round(held._sum.tdsAmount || 0);
    const billNumber = `TDS${act}-${month}`;
    const bill = party ? await tx.bill.findFirst({ where: { organizationId, partyId: party.id, billNumber }, include: { allocations: { where: { reversedAt: null } } } }) : null;
    const what = `${ACT_TEXT[act]}, ${month}`;
    if (bill) {
      const paid = bill.allocations.reduce((s: number, a: any) => s + a.amount, 0);
      // Never below what has already been deposited against it.
      const amount = Math.max(total, paid);
      if (amount === bill.totalAmount && (amount > 0) === (bill.status === "POSTED")) continue;
      await tx.billLine.deleteMany({ where: { billId: bill.id } });
      await tx.bill.update({
        where: { id: bill.id },
        data: { totalAmount: amount, status: amount > 0 ? "POSTED" : "VOIDED", lines: { create: [{ description: what, lineTotal: amount }] } },
      });
      continue;
    }
    if (total <= 0) continue;
    if (!party) party = await tx.party.create({ data: { organizationId, partyType: "OTHER", name: TDS_PARTY } });
    await tx.bill.create({
      data: {
        organizationId,
        partyId: party.id,
        billNumber,
        billDate: end,
        dueDate: new Date(`${tdsDueDate(month)}T12:00:00+05:30`),
        totalAmount: total,
        costHead: "OTHER",
        statutory: `TDS_${act}`,
        status: "POSTED",
        notes: `${what}. Kept up to date from the payments.`,
        createdBy: userId,
        lines: { create: [{ description: what, lineTotal: total }] },
      },
    });
  }
}

/** @deprecated the name from Phase 10; keeps every section's bill now. */
export const syncContractorTdsBill = syncTdsBills;

export class FinanceService {
  /**
   * The quarterly TDS return on payments other than salary (Form 26Q):
   * contractors (194C), professional and technical fees (194J) and rent
   * (194I). A challan a month for each section with TDS, and one row for
   * each payment with TDS held back (or none, with the reason), laid out for
   * the NSDL return utility.
   */
  static async contractorTdsReturn(organizationId: string, fy: string, quarter: 1 | 2 | 3 | 4) {
    const months = fyMonths(fy).slice((quarter - 1) * 3, quarter * 3);
    const { start } = istDayBounds(`${months[0]}-01`);
    const [ly, lm] = months[2].split("-").map(Number);
    const end = istDayBounds(new Date(Date.UTC(ly, lm, 0)).toISOString().slice(0, 10)).end;
    const [company, payments] = await Promise.all([
      companyProfile(organizationId),
      prisma.payment.findMany({
        where: { organizationId, status: "POSTED", reversedAt: null, tdsSection: { in: [...Object.keys(TDS_SECTIONS), "NONE"] }, paymentDate: { gte: start, lte: end } },
        include: { party: { select: { id: true, name: true, panNumber: true, taxIdentifier: true, partyType: true, tdsSection: true } } },
        orderBy: { paymentDate: "asc" },
      }),
    ]);
    const deductees = payments.map((p) => {
      const pan = p.party ? contractorPan(p.party) : null;
      const date = istDateKey(p.paymentDate);
      // A payment let off TDS is reported under the party's own section.
      const sec = paymentSection(p.tdsSection) || (p.party ? partySection(p.party, company) : null) || TDS_SECTIONS["194C"];
      return {
        paymentId: p.id,
        month: date.slice(0, 7),
        partyId: p.party?.id || null,
        name: p.party?.name || p.recipientName || "",
        pan,
        section: sec.act,
        sectionCode: sec.code,
        sectionLabel: sec.label,
        paidOn: date,
        amountPaid: Math.round(p.tdsBase + p.tdsCatchUp),
        rate: p.tdsRate,
        tds: p.tdsAmount,
        deductedOn: p.tdsAmount > 0 ? date : null,
        // Remark codes the return uses: C higher rate (no PAN), A lower deduction (certificate),
        // T transporter (194C), Y below the limit.
        remark: p.tdsSection === "NONE" ? (sec.act === "194C" ? "T" : "Y") : !pan ? "C" : p.tdsNote && /typed|197|certificate/i.test(p.tdsNote) ? "A" : "",
        note: p.tdsNote,
        reference: p.referenceNumber,
      };
    });
    // A challan table for every section with TDS this quarter (contractors at least).
    const acts = TDS_ACTS.filter((act) => act === "194C" || deductees.some((d) => d.section === act));
    const challans = [];
    for (const act of acts) {
      const mine = deductees.filter((d) => d.section === act);
      const tdsOf = (m: string) => mine.filter((d) => d.month === m).reduce((s, d) => s + d.tds, 0);
      const firstOf = (m: string) => mine.find((d) => d.month === m && d.tds > 0)?.paidOn || `${m}-01`;
      const rows = await tdsChallans({ organizationId, months, billNumber: (m) => `TDS${act}-${m}`, tdsOf, deductedOn: firstOf });
      challans.push(...rows.map((r) => ({ ...r, section: act })));
    }
    const problems: string[] = [];
    if (!company.tan) problems.push("Add the company TAN in Settings. The return cannot be filed without it.");
    const noPan = Array.from(new Set(deductees.filter((d) => !d.pan).map((d) => d.name)));
    if (noPan.length) problems.push(`No PAN for ${noPan.join(", ")}. Add it on the Vendors & Contractors page; until then TDS is 20% (5% for 194Q).`);
    problems.push(...challanProblems(acts.length > 1 ? challans : challans.map(({ section: _s, ...c }) => c), "Nothing recorded"));
    return {
      fy,
      quarter,
      months,
      filingDue: returnDueDate(fy, quarter),
      company: { name: company.name, tan: company.tan, gstin: company.gstin },
      sections: acts,
      challans,
      deductees,
      totals: {
        paid: deductees.reduce((s, d) => s + d.amountPaid, 0),
        tds: deductees.reduce((s, d) => s + d.tds, 0),
        deposited: challans.reduce((s, c) => s + c.deposited, 0),
      },
      problems,
    };
  }

  /**
   * TDS to hold back on a payment: 194C for contractors, or the section set
   * on the party (194J fees, 194I rent). Null when the party's payments are
   * not taxed (suppliers of goods).
   */
  static async paymentTds(input: {
    organizationId: string;
    partyId?: string | null;
    amount: number;
    paymentDate: Date;
    allocations?: PaymentAllocationInput[];
    tds?: RecordPaymentInput["tds"];
    excludePaymentId?: string;
  }): Promise<(TdsResult & { pan: string | null; sectionKey: string; label: string }) | null> {
    if (!input.partyId) return null;
    const party = await prisma.party.findFirst({ where: { id: input.partyId, organizationId: input.organizationId } });
    const section = party ? partySection(party, await companyProfile(input.organizationId)) : null;
    if (!party || !section) return null;
    // The part of the payment that is GST is not taxed.
    let base = input.amount;
    const allocs = input.allocations || [];
    if (allocs.length) {
      const bills = await prisma.bill.findMany({
        where: { id: { in: allocs.map((a) => a.billId) }, organizationId: input.organizationId },
        select: { id: true, totalAmount: true, taxableAmount: true, reverseCharge: true },
      });
      const byId = new Map(bills.map((b) => [b.id, b]));
      const allocated = allocs.reduce((s, a) => s + a.amount, 0);
      base = Math.max(0, input.amount - allocated);
      for (const a of allocs) {
        const b = byId.get(a.billId);
        const share = b && b.taxableAmount != null && b.totalAmount > 0 && !b.reverseCharge ? b.taxableAmount / b.totalAmount : 1;
        base += a.amount * share;
      }
    }
    // The limit counts the financial year's payments, or the month's for rent.
    const day = istDateKey(input.paymentDate);
    const from = section.period === "MONTH" ? `${day.slice(0, 7)}-01` : fyStartOf(day);
    const earlier = await prisma.payment.findMany({
      where: {
        organizationId: input.organizationId,
        partyId: party.id,
        status: { in: ["POSTED", "PENDING_APPROVAL"] },
        reversedAt: null,
        paymentDate: { gte: istDayBounds(from).start, lte: istDayBounds(day).end },
        ...(input.excludePaymentId ? { id: { not: input.excludePaymentId } } : {}),
      },
      select: { amount: true, tdsBase: true, tdsSection: true, tdsCatchUp: true },
    });
    const own = (p: { amount: number; tdsBase: number }) => (p.tdsBase > 0 ? p.tdsBase : p.amount);
    const periodBase = earlier.reduce((s, p) => s + own(p), 0);
    const untaxed = earlier.filter((p) => !p.tdsSection).reduce((s, p) => s + own(p), 0);
    const caughtUp = earlier.reduce((s, p) => s + p.tdsCatchUp, 0);
    const pan = contractorPan(party);
    const result = workTds({
      section,
      pan,
      base,
      before: { base: periodBase, untaxedBase: Math.max(0, untaxed - caughtUp) },
      mode: input.tds?.mode,
      manualAmount: input.tds?.amount,
      reason: input.tds?.reason,
    });
    if (result.amount > input.amount) throw new Error("TDS cannot be more than the payment.");
    return { ...result, pan, sectionKey: section.key, label: section.label };
  }

  /** @deprecated Phase 10 name; every section now. */
  static contractorTds(input: Parameters<typeof FinanceService.paymentTds>[0]) {
    return FinanceService.paymentTds(input);
  }

  /**
   * Create a posted Bill with lines
   */
  static async createBill(input: CreateBillInput) {
    assertPermission(input.role, "finance:write");

    if (!input.lines || input.lines.length === 0) {
      throw new Error("Bill must contain at least one line item");
    }

    const party = await prisma.party.findFirst({
      where: { id: input.partyId, organizationId: input.organizationId },
    });
    if (!party) {
      throw new Error("NotFound: Vendor/Contractor not found");
    }

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: input.organizationId },
      });
      if (!project) {
        throw new Error("NotFound: Project not found or outside organization scope");
      }
    }

    // Verify materials belong to organization
    for (const line of input.lines) {
      if (line.materialId) {
        const material = await prisma.material.findFirst({
          where: { id: line.materialId, organizationId: input.organizationId },
        });
        if (!material) {
          throw new Error(`NotFound: Material ${line.materialId} not found or outside organization scope`);
        }
      }
    }

    // Check duplicate bill number for party
    const existingBill = await prisma.bill.findUnique({
      where: {
        organizationId_partyId_billNumber: {
          organizationId: input.organizationId,
          partyId: input.partyId,
          billNumber: input.billNumber,
        },
      },
    });
    if (existingBill) {
      throw new Error(`Bill #${input.billNumber} already exists for this vendor`);
    }

    const linesTotal = roundPaise(input.lines.reduce((sum: number, line: any) => sum + (line.lineTotal || 0), 0));
    let gstFields: Record<string, unknown> = {};
    let calculatedTotal = linesTotal;
    let lineTax: { gstRate: number | null; taxAmount: number }[] = input.lines.map(() => ({ gstRate: null, taxAmount: 0 }));
    if (input.gst) {
      const rates = input.lines.map((l) => l.gstRate ?? input.gst!.rate ?? null);
      if (rates.some((r) => r === null)) throw new Error("Give a GST rate for the bill or for every line");
      if (rates.some((r) => !BILL_GST_RATES.includes(r as number))) throw new Error("GST rate must be 0, 5, 12, 18 or 28%");
      let interState = input.gst.interState;
      if (interState === undefined || interState === null) {
        const ours = gstStateCode((await companyProfile(input.organizationId)).gstin);
        const theirs = gstStateCode(party.taxIdentifier);
        interState = !!ours && !!theirs && ours !== theirs;
      }
      // Tax is worked out line by line, so a bill can mix 5% sand with 18% steel.
      const split = { cgst: 0, sgst: 0, igst: 0, tax: 0 };
      lineTax = input.lines.map((l, i) => {
        const t = billGst(l.lineTotal || 0, rates[i] as number, interState as boolean);
        split.cgst += t.cgst;
        split.sgst += t.sgst;
        split.igst += t.igst;
        split.tax += t.tax;
        return { gstRate: rates[i], taxAmount: t.tax };
      });
      const reverseCharge = !!input.gst.reverseCharge;
      calculatedTotal = reverseCharge ? linesTotal : roundPaise(linesTotal + split.tax);
      gstFields = {
        gstRate: Math.max(...(rates as number[])),
        taxableAmount: linesTotal,
        cgst: split.cgst,
        sgst: split.sgst,
        igst: split.igst,
        itcEligible: input.gst.itcEligible ?? true,
        reverseCharge,
      };
    }

    return await prisma.$transaction(async (tx: any) => {
      const bill = await tx.bill.create({
        data: {
          organizationId: input.organizationId,
          partyId: input.partyId,
          projectId: input.projectId ?? null,
          billNumber: input.billNumber,
          billDate: input.billDate,
          dueDate: input.dueDate ?? null,
          totalAmount: calculatedTotal,
          ...gstFields,
          costHead: input.costHead ?? null,
          status: "POSTED",
          notes: input.notes ?? null,
          createdBy: input.userId,
          lines: {
            create: input.lines.map((l, i) => ({
              description: l.description,
              materialId: l.materialId ?? null,
              quantity: l.quantity ?? null,
              unitRate: l.unitRate ?? null,
              lineTotal: l.lineTotal,
              ...lineTax[i],
            })),
          },
        },
        include: { lines: true, party: true },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "BILL_CREATED",
          entityType: "BILL",
          entityId: bill.id,
          afterJson: JSON.stringify({
            billNumber: bill.billNumber,
            totalAmount: bill.totalAmount,
            gstRate: bill.gstRate,
            partyId: bill.partyId,
          }),
        },
      });

      return bill;
    });
  }

  /**
   * Record a payment with idempotency protection, paying account, and approval query support
   */
  static async recordPayment(input: RecordPaymentInput) {
    const isQuerySubmission = input.autoApprove === false || Boolean(input.approvalQuery);
    const isStaffQuery = isQuerySubmission && (input.role === "SITE_SUPERVISOR" || input.role === "PROJECT_MANAGER");
    if (!isStaffQuery) {
      assertPermission(input.role, "finance:write");
    }

    if (input.amount <= 0) {
      throw new Error("Payment amount must be strictly greater than zero");
    }

    const payingAccount = (input.payingAccount || "Company Primary Operating A/C").trim();
    if (!payingAccount) {
      throw new Error("Paying account is mandatory for disbursement");
    }

    const approvalQuery = input.approvalQuery?.trim() || input.notes?.trim() || "Payment disbursement";

    let recipientType = input.recipientType || "VENDOR";
    let recipientName = input.recipientName?.trim();
    let party: any = null;

    if (input.partyId) {
      party = await prisma.party.findFirst({
        where: { id: input.partyId, organizationId: input.organizationId },
      });
      if (!party) {
        throw new Error("NotFound: Vendor/Contractor not found");
      }
      recipientName = recipientName || party.name;
      recipientType = input.recipientType || party.type || "VENDOR";
    } else {
      if (!recipientName) {
        throw new Error("Recipient name or valid Party is required");
      }
    }

    // Idempotency Check
    const existingPayment = await prisma.payment.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      include: { allocations: true, party: true },
    });

    if (existingPayment) {
      // Idempotent return of already processed payment
      return {
        payment: existingPayment,
        idempotentReplay: true,
      };
    }

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: input.organizationId },
      });
      if (!project) {
        throw new Error("NotFound: Project not found or outside organization scope");
      }
    }

    // Determine status & approval. Only SUPER_ADMIN / ORG_ADMIN may post a
    // payment directly (autoApprove or status POSTED); every other role's
    // payment always waits for approval, whatever the request asks for.
    const canPostDirectly = input.role === "SUPER_ADMIN" || input.role === "ORG_ADMIN";
    let status: string;
    let approvedBy: string | null = null;
    let approvedAt: Date | null = null;

    if (!canPostDirectly || isStaffQuery) {
      status = "PENDING_APPROVAL";
    } else if (input.status === "POSTED" || input.status === "PENDING_APPROVAL") {
      status = input.status;
    } else if (input.autoApprove === true) {
      status = "POSTED";
    } else if (input.autoApprove === false || input.approvalQuery) {
      // Admin chose to route the payment for review
      status = "PENDING_APPROVAL";
    } else {
      status = "POSTED";
    }

    if (status === "POSTED") {
      approvedBy = input.autoApprove === true
        ? `${input.role} (Auto-Approved)`
        : `${input.role} (Direct)`;
      approvedAt = new Date();
    }

    // Validate allocations if provided
    let totalAllocated = 0;
    if (input.allocations && input.allocations.length > 0) {
      totalAllocated = roundPaise(input.allocations.reduce((sum: number, a: any) => sum + (a.amount || 0), 0));
      if (totalAllocated > input.amount) {
        throw new Error(
          `Total allocated (${totalAllocated} paise) cannot exceed payment amount (${input.amount} paise)`
        );
      }
    }

    if (input.tds?.mode === "NONE" && !input.tds.reason?.trim()) {
      throw new Error("Say why no TDS is held back, for example the transporter's declaration.");
    }
    const tds = await FinanceService.paymentTds({
      organizationId: input.organizationId,
      partyId: party?.id,
      amount: input.amount,
      paymentDate: input.paymentDate,
      allocations: input.allocations,
      tds: input.tds,
    });

    return await prisma.$transaction(async (tx: any) => {
      // Check each bill's current outstanding balance
      if (input.allocations && input.allocations.length > 0) {
        for (const alloc of input.allocations) {
          const bill = await tx.bill.findUnique({
            where: { id: alloc.billId },
            include: {
              allocations: {
                where: { reversedAt: null, payment: { status: "POSTED" } },
              },
            },
          });

          if (!bill || bill.organizationId !== input.organizationId) {
            throw new Error(`NotFound: Bill ${alloc.billId} not found`);
          }

          const currentPaidOnBill = roundPaise(
            bill.allocations.reduce((s: number, a: any) => s + (a.amount || 0), 0)
          );
          const currentOutstanding = roundPaise(bill.totalAmount - currentPaidOnBill);

          if (alloc.amount > currentOutstanding) {
            throw new Error(
              `Allocation of ${alloc.amount} paise exceeds outstanding balance of ${currentOutstanding} paise on Bill #${bill.billNumber}`
            );
          }
        }
      }

      // 1. Create Payment
      const payment = await tx.payment.create({
        data: {
          organizationId: input.organizationId,
          partyId: input.partyId ?? null,
          recipientType,
          recipientName,
          payingAccount,
          approvalQuery,
          projectId: input.projectId ?? null,
          paymentDate: input.paymentDate,
          amount: input.amount,
          currency: input.currency ?? "INR",
          method: input.method,
          costHead: input.costHead ?? null,
          referenceNumber: input.referenceNumber,
          status,
          approvedBy,
          approvedAt,
          idempotencyKey: input.idempotencyKey,
          ...(tds
            ? {
                tdsSection: tds.section ?? (input.tds?.mode === "NONE" ? "NONE" : null),
                tdsRate: tds.rate,
                tdsBase: Math.round(tds.base),
                tdsCatchUp: Math.round(tds.catchUpBase),
                tdsAmount: tds.amount,
                tdsNote: tds.note,
              }
            : {}),
          notes: input.notes ?? null,
          createdBy: input.userId,
          allocations: input.allocations
            ? {
                create: input.allocations.map((a) => ({
                  billId: a.billId,
                  amount: a.amount,
                })),
              }
            : undefined,
        },
        include: { allocations: true, party: true },
      });

      // 2. Log Audit Event
      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: status === "POSTED" ? "PAYMENT_POSTED" : "PAYMENT_APPROVAL_REQUESTED",
          entityType: "PAYMENT",
          entityId: payment.id,
          afterJson: JSON.stringify({
            partyName: recipientName,
            recipientType,
            payingAccount,
            approvalQuery,
            amount: payment.amount,
            method: payment.method,
            referenceNumber: payment.referenceNumber,
            status,
            allocationsCount: payment.allocations.length,
            ...(payment.tdsAmount ? { tdsSection: payment.tdsSection, tdsAmount: payment.tdsAmount, bankPaid: payment.amount - payment.tdsAmount } : {}),
          }),
          reason: status === "POSTED"
            ? `Payment of ₹${(payment.amount / 100).toFixed(2)} posted directly to ${recipientName} from account ${payingAccount}`
            : `Payment approval query of ₹${(payment.amount / 100).toFixed(2)} raised to Super Admin for ${recipientName} from account ${payingAccount}. Reason: ${approvalQuery}`,
        },
      });

      if (status === "POSTED" && payment.tdsAmount > 0) {
        await syncTdsBills(tx, input.organizationId, istDateKey(payment.paymentDate).slice(0, 7), input.userId);
      }

      return {
        payment,
        idempotentReplay: false,
      };
    });
  }

  /**
   * Super Admin confirms and approves a pending payment disbursement
   */
  static async approvePayment(input: {
    organizationId?: string;
    paymentId: string;
    userId: string;
    role: Role;
    approverName: string;
    notes?: string;
  }) {
    if (input.role !== "SUPER_ADMIN" && input.role !== "ORG_ADMIN") {
      throw new Error("Super Admin or Organization Admin credentials required to approve payments");
    }

    const where: any = { id: input.paymentId };
    if (input.role !== "SUPER_ADMIN" && input.organizationId) {
      where.organizationId = input.organizationId;
    }

    const payment = await prisma.payment.findFirst({
      where,
      include: { allocations: { include: { bill: true } }, party: true },
    });

    if (!payment) {
      throw new Error("NotFound: Payment not found");
    }

    if (payment.status === "POSTED") {
      return payment; // Idempotent approval
    }

    if (payment.status !== "PENDING_APPROVAL") {
      throw new Error(`Cannot approve payment in '${payment.status}' status`);
    }

    return await prisma.$transaction(async (tx: any) => {
      // Validate allocations outstanding balances
      if (payment.allocations && payment.allocations.length > 0) {
        for (const alloc of payment.allocations) {
          const bill = await tx.bill.findUnique({
            where: { id: alloc.billId },
            include: {
              allocations: {
                where: { reversedAt: null, payment: { status: "POSTED" } },
              },
            },
          });
          if (bill) {
            const alreadyPaid = roundPaise(
              bill.allocations.reduce((s: number, a: any) => s + (a.amount || 0), 0)
            );
            const outstanding = roundPaise(bill.totalAmount - alreadyPaid);
            if (alloc.amount > outstanding) {
              throw new Error(
                `Allocation of ${alloc.amount} paise exceeds current outstanding balance of ${outstanding} paise on Bill #${bill.billNumber}`
              );
            }
          }
        }
      }

      const now = new Date();
      const approverStr = `${input.approverName} (${input.role})`;

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "POSTED",
          approvedBy: approverStr,
          approvedAt: now,
          notes: input.notes
            ? `${payment.notes ? payment.notes + "\n" : ""}[Approved by ${approverStr}]: ${input.notes}`
            : payment.notes,
        },
        include: { allocations: { include: { bill: true } }, party: true, creator: true },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: payment.organizationId,
          actorUserId: input.userId,
          action: "PAYMENT_APPROVED",
          entityType: "PAYMENT",
          entityId: payment.id,
          beforeJson: JSON.stringify({ status: "PENDING_APPROVAL" }),
          afterJson: JSON.stringify({
            status: "POSTED",
            approvedBy: updatedPayment.approvedBy,
            approvedAt: updatedPayment.approvedAt,
            amount: updatedPayment.amount,
            payingAccount: updatedPayment.payingAccount,
            recipientName: updatedPayment.recipientName,
          }),
          reason: `Payment disbursement of ₹${(payment.amount / 100).toFixed(2)} to ${payment.recipientName || payment.party?.name || "payee"} confirmed and approved by ${approverStr} from account ${payment.payingAccount || "Primary Account"}`,
        },
      });

      if (payment.tdsAmount > 0) {
        await syncTdsBills(tx, payment.organizationId, istDateKey(payment.paymentDate).slice(0, 7), input.userId);
      }

      return updatedPayment;
    });
  }

  /**
   * Super Admin rejects a pending payment query
   */
  static async rejectPayment(input: {
    organizationId?: string;
    paymentId: string;
    userId: string;
    role: Role;
    rejectorName: string;
    reason: string;
  }) {
    if (input.role !== "SUPER_ADMIN" && input.role !== "ORG_ADMIN") {
      throw new Error("Super Admin or Organization Admin credentials required to reject payments");
    }

    if (!input.reason || input.reason.trim().length < 3) {
      throw new Error("A clear rejection reason is mandatory");
    }

    const where: any = { id: input.paymentId };
    if (input.role !== "SUPER_ADMIN" && input.organizationId) {
      where.organizationId = input.organizationId;
    }

    const payment = await prisma.payment.findFirst({
      where,
      include: { allocations: true, party: true },
    });

    if (!payment) {
      throw new Error("NotFound: Payment not found");
    }

    if (payment.status !== "PENDING_APPROVAL") {
      throw new Error(`Cannot reject payment in '${payment.status}' status`);
    }

    return await prisma.$transaction(async (tx: any) => {
      // Remove any allocations so bill balances are untouched
      await tx.paymentAllocation.deleteMany({
        where: { paymentId: payment.id },
      });

      const now = new Date();
      const rejectorStr = `${input.rejectorName} (${input.role})`;

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REJECTED",
          rejectionReason: input.reason.trim(),
          approvedBy: rejectorStr,
          approvedAt: now,
        },
        include: { party: true, creator: true },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: payment.organizationId,
          actorUserId: input.userId,
          action: "PAYMENT_REJECTED",
          entityType: "PAYMENT",
          entityId: payment.id,
          beforeJson: JSON.stringify({ status: "PENDING_APPROVAL" }),
          afterJson: JSON.stringify({
            status: "REJECTED",
            rejectionReason: input.reason,
            approvedBy: rejectorStr,
          }),
          reason: `Payment disbursement query of ₹${(payment.amount / 100).toFixed(2)} to ${payment.recipientName || payment.party?.name || "payee"} rejected by ${rejectorStr}: ${input.reason}`,
        },
      });

      return updatedPayment;
    });
  }

  /**
   * Reverse a posted payment, restoring the bill balances
   */
  static async reversePayment(input: ReversePaymentInput) {
    assertPermission(input.role, "finance:reverse");

    if (!input.reason || input.reason.trim().length < 5) {
      throw new Error("A detailed reason is mandatory for payment reversal");
    }

    const payment = await prisma.payment.findFirst({
      where: { id: input.paymentId, organizationId: input.organizationId },
      include: { allocations: true, party: true },
    });

    if (!payment) {
      throw new Error("NotFound: Payment not found");
    }

    if (payment.status === "REVERSED") {
      throw new Error("Payment has already been reversed");
    }

    return await prisma.$transaction(async (tx: any) => {
      const now = new Date();

      // 1. Mark allocations reversed
      await tx.paymentAllocation.updateMany({
        where: { paymentId: payment.id },
        data: { reversedAt: now },
      });

      // 2. Mark payment reversed
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REVERSED",
          reversedAt: now,
          reversalReason: input.reason,
        },
      });

      // 3. Log Audit Event
      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "PAYMENT_REVERSED",
          entityType: "PAYMENT",
          entityId: payment.id,
          reason: input.reason,
          beforeJson: JSON.stringify({ status: "POSTED", amount: payment.amount }),
          afterJson: JSON.stringify({ status: "REVERSED", reversedAt: now }),
        },
      });

      if (payment.tdsAmount > 0) {
        await syncTdsBills(tx, input.organizationId, istDateKey(payment.paymentDate).slice(0, 7), input.userId);
      }

      return updatedPayment;
    });
  }

  /**
   * Retrieves single-source-of-truth party statement
   */
  static async getPartyStatement(organizationId: string, partyId: string) {
    const party = await prisma.party.findFirst({
      where: { id: partyId, organizationId },
    });
    if (!party) {
      throw new Error("NotFound: Party not found");
    }

    // 1. Fetch bills
    const bills = await prisma.bill.findMany({
      where: { partyId, organizationId, status: "POSTED" },
      include: {
        allocations: {
          where: { reversedAt: null, payment: { status: "POSTED" } },
        },
        lines: true,
      },
      orderBy: { billDate: "asc" },
    });

    // 2. Fetch payments
    const payments = await prisma.payment.findMany({
      where: { partyId, organizationId },
      include: {
        allocations: {
          include: { bill: true },
        },
      },
      orderBy: { paymentDate: "asc" },
    });

    let totalBilled = 0;
    let totalPaid = 0;

    const billsWithBalances = bills.map((b: any) => {
      const paidOnBill = roundPaise(b.allocations.reduce((sum: number, a: any) => sum + (a.amount || 0), 0));
      const outstandingOnBill = roundPaise(b.totalAmount - paidOnBill);
      totalBilled = roundPaise(totalBilled + b.totalAmount);
      return {
        ...b,
        paidAmount: paidOnBill,
        outstandingAmount: outstandingOnBill,
      };
    });

    payments.forEach((p: any) => {
      if (p.status === "POSTED") {
        totalPaid = roundPaise(totalPaid + p.amount);
      }
    });

    const outstandingBalance = roundPaise(totalBilled - totalPaid);

    return {
      party,
      totalBilled,
      totalPaid,
      outstandingBalance,
      bills: billsWithBalances,
      payments,
    };
  }
}
