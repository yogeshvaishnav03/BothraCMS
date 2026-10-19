import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission, requireProjectAccess } from "@/lib/server-auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createPaymentSchema = z.object({
  partyId: z.string().optional(),
  recipientType: z.enum(["VENDOR", "CONTRACTOR", "EMPLOYEE"]).optional().default("VENDOR"),
  recipientName: z.string().optional(),
  payingAccount: z.string().optional().default("Primary Operating Account"),
  approvalQuery: z.string().optional(),
  reason: z.string().optional(),
  projectId: z.string().min(1).optional(),
  paymentDate: z.string(),
  amount: z.number().positive(),
  method: z.enum(["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "NEFT_RTGS"]),
  referenceNumber: z.string().min(1),
  idempotencyKey: z.string().min(1),
  notes: z.string().optional(),
  autoApprove: z.boolean().optional(),
  allocations: z
    .array(
      z.object({
        billId: z.string().min(1),
        amount: z.number().positive(),
      })
    )
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");

    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId");
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const allTenants = searchParams.get("allTenants") === "true";
    const includeArchived = searchParams.get("includeArchived") === "true";

    if (projectId) {
      await requireProjectAccess(user, projectId, "finance:read");
    }

    const where: any = {};
    if (!allTenants || user.role !== "SUPER_ADMIN") {
      where.organizationId = user.organizationId;
    }
    if (!includeArchived) {
      where.isArchived = false;
    }

    if (partyId) where.partyId = partyId;
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    const payments = await prisma.payment.findMany({
      where,
      include: {
        party: true,
        project: true,
        organization: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true, role: true, email: true } },
        allocations: { include: { bill: true } },
        attachments: {
          where: { isArchived: false },
          select: { id: true, fileId: true, fileName: true, category: true, mimeType: true },
        },
      },
      orderBy: { paymentDate: "desc" },
    });

    return jsonSuccess(payments);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const body = await req.json();
    const data = createPaymentSchema.parse(body);

    if (data.projectId) {
      await requireProjectAccess(user, data.projectId, "finance:write");
    }

    const result = await FinanceService.recordPayment({
      organizationId: user.organizationId,
      partyId: data.partyId,
      recipientType: data.recipientType,
      recipientName: data.recipientName,
      payingAccount: data.payingAccount,
      approvalQuery: data.approvalQuery || data.reason,
      projectId: data.projectId,
      paymentDate: new Date(data.paymentDate),
      amount: data.amount,
      method: data.method,
      referenceNumber: data.referenceNumber,
      idempotencyKey: data.idempotencyKey,
      notes: data.notes,
      userId: user.userId,
      role: user.role,
      autoApprove: data.autoApprove,
      allocations: data.allocations,
    });

    return jsonSuccess(result, result.idempotentReplay ? 200 : 201);
  } catch (error) {
    return handleApiError(error);
  }
}
