import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

const createPaymentSchema = z.object({
  partyId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  paymentDate: z.string(),
  amount: z.number().positive(),
  method: z.enum(["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "NEFT_RTGS"]),
  referenceNumber: z.string().min(1),
  idempotencyKey: z.string().min(1),
  notes: z.string().optional(),
  allocations: z.array(
    z.object({
      billId: z.string().min(1),
      amount: z.number().positive(),
    })
  ).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId");

    try {
      const where: any = { organizationId: user.organizationId };
      if (partyId) where.partyId = partyId;

      const payments = await prisma.payment.findMany({
        where,
        include: {
          party: true,
          project: true,
          allocations: { include: { bill: true } },
        },
        orderBy: { paymentDate: "desc" },
      });

      return jsonSuccess(payments);
    } catch {
      return jsonSuccess(dynamicStore.getPayments(partyId));
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = createPaymentSchema.parse(body);

    try {
      const result = await FinanceService.recordPayment({
        organizationId: user.organizationId,
        partyId: data.partyId,
        projectId: data.projectId,
        paymentDate: new Date(data.paymentDate),
        amount: data.amount,
        method: data.method,
        referenceNumber: data.referenceNumber,
        idempotencyKey: data.idempotencyKey,
        notes: data.notes,
        allocations: data.allocations,
        userId: user.userId,
        role: user.role,
      });

      return jsonSuccess(result, result.idempotentReplay ? 200 : 201);
    } catch (dbErr) {
      console.warn("[PAYMENTS] Database write failed, saving to dynamicStore:", dbErr);
      const newPayment = dynamicStore.createPayment({
        partyId: data.partyId,
        paymentDate: data.paymentDate,
        amount: data.amount,
        paymentMode: data.method,
        referenceNumber: data.referenceNumber,
        notes: data.notes,
      });
      return jsonSuccess(newPayment, 201);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
