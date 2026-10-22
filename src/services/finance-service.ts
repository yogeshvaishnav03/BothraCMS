import { prisma } from "@/lib/db";
import { assertPermission, Role } from "@/lib/permissions";
import { roundPaise } from "@/lib/financial-math";
import { companyProfile, gstStateCode } from "@/lib/company";

export interface BillLineInput {
  description: string;
  materialId?: string;
  quantity?: number;
  unitRate?: number; // paise
  lineTotal: number; // paise
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
  /** GST on top of the lines. Supplier in another state → IGST, else CGST + SGST. */
  gst?: { rate: number; interState?: boolean | null; itcEligible?: boolean } | null;
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
}

export interface ReversePaymentInput {
  organizationId: string;
  paymentId: string;
  reason: string;
  userId: string;
  role: Role;
}

export class FinanceService {
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
    if (input.gst) {
      if (!BILL_GST_RATES.includes(input.gst.rate)) throw new Error("GST rate must be 0, 5, 12, 18 or 28%");
      let interState = input.gst.interState;
      if (interState === undefined || interState === null) {
        const ours = gstStateCode((await companyProfile(input.organizationId)).gstin);
        const theirs = gstStateCode(party.taxIdentifier);
        interState = !!ours && !!theirs && ours !== theirs;
      }
      const split = billGst(linesTotal, input.gst.rate, interState);
      calculatedTotal = roundPaise(linesTotal + split.tax);
      gstFields = { gstRate: input.gst.rate, taxableAmount: linesTotal, cgst: split.cgst, sgst: split.sgst, igst: split.igst, itcEligible: input.gst.itcEligible ?? true };
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
            create: input.lines.map((l) => ({
              description: l.description,
              materialId: l.materialId ?? null,
              quantity: l.quantity ?? null,
              unitRate: l.unitRate ?? null,
              lineTotal: l.lineTotal,
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
          }),
          reason: status === "POSTED"
            ? `Payment of ₹${(payment.amount / 100).toFixed(2)} posted directly to ${recipientName} from account ${payingAccount}`
            : `Payment approval query of ₹${(payment.amount / 100).toFixed(2)} raised to Super Admin for ${recipientName} from account ${payingAccount}. Reason: ${approvalQuery}`,
        },
      });

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
