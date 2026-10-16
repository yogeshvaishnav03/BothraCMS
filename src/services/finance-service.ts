import { prisma } from "@/lib/db";
import { assertPermission, Role } from "@/lib/permissions";
import { roundPaise } from "@/lib/financial-math";

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
  userId: string;
  role: Role;
}

export interface PaymentAllocationInput {
  billId: string;
  amount: number; // paise
}

export interface RecordPaymentInput {
  organizationId: string;
  partyId: string;
  projectId?: string;
  paymentDate: Date;
  amount: number; // paise
  currency?: string;
  method: string; // BANK_TRANSFER, UPI, CASH, CHEQUE, NEFT_RTGS
  referenceNumber: string;
  idempotencyKey: string;
  allocations?: PaymentAllocationInput[];
  notes?: string;
  userId: string;
  role: Role;
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

    const calculatedTotal = roundPaise(input.lines.reduce((sum: number, line: any) => sum + (line.lineTotal || 0), 0));

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
            partyId: bill.partyId,
          }),
        },
      });

      return bill;
    });
  }

  /**
   * Record a payment with idempotency protection and atomic bill allocation
   */
  static async recordPayment(input: RecordPaymentInput) {
    assertPermission(input.role, "finance:write");

    if (input.amount <= 0) {
      throw new Error("Payment amount must be strictly greater than zero");
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
            include: { allocations: true },
          });

          if (!bill || bill.organizationId !== input.organizationId) {
            throw new Error(`NotFound: Bill ${alloc.billId} not found`);
          }

          const currentPaidOnBill = roundPaise(
            bill.allocations
              .filter((a: any) => !a.reversedAt)
              .reduce((s: number, a: any) => s + (a.amount || 0), 0)
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
          partyId: input.partyId,
          projectId: input.projectId ?? null,
          paymentDate: input.paymentDate,
          amount: input.amount,
          currency: input.currency ?? "INR",
          method: input.method,
          referenceNumber: input.referenceNumber,
          status: "POSTED",
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
          action: "PAYMENT_POSTED",
          entityType: "PAYMENT",
          entityId: payment.id,
          afterJson: JSON.stringify({
            partyName: party.name,
            amount: payment.amount,
            method: payment.method,
            referenceNumber: payment.referenceNumber,
            allocationsCount: payment.allocations.length,
          }),
        },
      });

      return {
        payment,
        idempotentReplay: false,
      };
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
          where: { reversedAt: null },
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

    payments.forEach((p) => {
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
