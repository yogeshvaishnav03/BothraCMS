import { NextRequest } from "next/server";
import { z } from "zod";
import { COST_HEAD_KEYS } from "@/services/project-budget-service";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission, requireProjectAccess } from "@/lib/server-auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createBillSchema = z.object({
  partyId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  billNumber: z.string().min(1),
  billDate: z.string(),
  dueDate: z.string().optional(),
  status: z.enum(["POSTED", "CHALLAN", "DRAFT"]).optional(),
  costHead: z.enum(COST_HEAD_KEYS).optional().nullable(),
  notes: z.string().optional(),
  attachmentFileId: z.string().optional(),
  totalAmount: z.number().min(0).optional(),
  payment: z
    .object({
      isPaid: z.boolean(),
      paidAmount: z.number().min(0),
      payingAccount: z.string().optional(),
      method: z.string().optional(),
      referenceNumber: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  gst: z
    .object({
      rate: z.number().min(0).max(28).nullable().optional(),
      interState: z.boolean().nullable().optional(),
      itcEligible: z.boolean().optional(),
      reverseCharge: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  lines: z.array(
    z.object({
      description: z.string().min(1),
      materialId: z.string().min(1).optional(),
      quantity: z.number().optional(),
      unitRate: z.number().optional(),
      lineTotal: z.number().min(0),
      gstRate: z.number().min(0).max(28).nullable().optional(),
    })
  ).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");

    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId");
    const projectId = searchParams.get("projectId");
    const statusParam = searchParams.get("status");
    const includeArchived = searchParams.get("includeArchived") === "true";

    if (projectId) {
      await requireProjectAccess(user, projectId, "finance:read");
    }

    const where: any = { organizationId: user.organizationId };
    if (!includeArchived) {
      where.isArchived = false;
    }
    if (statusParam) {
      where.status = statusParam;
    } else {
      where.status = { in: ["POSTED", "CHALLAN"] };
    }
    if (partyId) where.partyId = partyId;
    if (projectId) where.projectId = projectId;

    const bills = await prisma.bill.findMany({
      where,
      include: {
        party: true,
        project: true,
        lines: { include: { material: true } },
        allocations: { where: { reversedAt: null } },
      },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
    });

    const enriched = bills.map((b: any) => {
      const paidAmount = b.allocations.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
      const outstandingAmount = b.totalAmount - paidAmount;
      return {
        ...b,
        paidAmount,
        outstandingAmount,
      };
    });

    return jsonSuccess(enriched);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const body = await req.json();
    const data = createBillSchema.parse(body);

    if (data.projectId) {
      await requireProjectAccess(user, data.projectId, "finance:write");
    }

    const bill = await FinanceService.createBill({
      organizationId: user.organizationId,
      partyId: data.partyId,
      projectId: data.projectId,
      billNumber: data.billNumber,
      billDate: new Date(data.billDate),
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      costHead: data.costHead,
      status: data.status,
      notes: data.notes,
      gst: data.gst,
      lines: data.lines,
      totalAmount: data.totalAmount,
      userId: user.userId,
      role: user.role,
      permissions: user.permissions,
    });

    let paymentRecord: any = null;
    if (data.payment && data.payment.isPaid && data.payment.paidAmount > 0) {
      const isUnderThreshold = data.payment.paidAmount < 2000000;
      const isExecutive = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
      const party = bill.party || (await prisma.party.findUnique({ where: { id: data.partyId } }));

      paymentRecord = await FinanceService.recordPayment({
        organizationId: user.organizationId,
        partyId: data.partyId,
        recipientType: party?.partyType || "VENDOR",
        recipientName: party?.name || "Vendor",
        payingAccount: data.payment.payingAccount || "HDFC Bank Operating A/C (A/C: ...4421)",
        approvalQuery: data.payment.notes || `Payment for Bill #${bill.billNumber}`,
        paymentDate: new Date(data.billDate),
        amount: data.payment.paidAmount,
        method: data.payment.method || "BANK_TRANSFER",
        referenceNumber: data.payment.referenceNumber || `PAY-${bill.billNumber}-${Date.now().toString().slice(-4)}`,
        idempotencyKey: `pay-bill-${bill.id}-${Date.now()}`,
        costHead: data.costHead || undefined,
        projectId: data.projectId,
        notes: data.payment.notes || `Payment recorded on bill #${bill.billNumber}`,
        userId: user.userId,
        role: user.role,
        permissions: user.permissions,
        autoApprove: isUnderThreshold ? true : (isExecutive ? true : false),
        allocations: [
          {
            billId: bill.id,
            amount: data.payment.paidAmount,
          },
        ],
      });
    }

    if (data.attachmentFileId) {
      try {
        await prisma.attachment.updateMany({
          where: {
            fileId: data.attachmentFileId,
            organizationId: user.organizationId,
          },
          data: {
            entityId: bill.id,
            entityType: "BILL",
            projectId: data.projectId || null,
          },
        });
      } catch (err) {
        console.warn("[bills] Could not link attachment to bill:", err);
      }
    }

    return jsonSuccess({ ...bill, payment: paymentRecord }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
