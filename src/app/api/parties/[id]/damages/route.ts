import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { LiquidatedDamagesService } from "@/services/liquidated-damages-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createDamageSchema = z.object({
  projectId: z.string().optional().nullable(),
  amount: z.number().positive("Deduction amount must be greater than zero"),
  damageType: z.enum(["DELAY", "DEFECT", "BREAKAGE", "SAFETY", "BREACH", "OTHER"]).optional().default("DELAY"),
  reason: z.string().min(3, "Reason / damage description must be at least 3 characters"),
  referenceNumber: z.string().optional().nullable(),
  deductionDate: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");

    const result = await LiquidatedDamagesService.getPartyDamages(
      user.organizationId,
      params.id
    );

    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const body = await req.json();
    const data = createDamageSchema.parse(body);

    const record = await LiquidatedDamagesService.recordDamage({
      organizationId: user.organizationId,
      partyId: params.id,
      projectId: data.projectId,
      amount: data.amount,
      damageType: data.damageType,
      reason: data.reason,
      referenceNumber: data.referenceNumber,
      deductionDate: data.deductionDate ? new Date(data.deductionDate) : new Date(),
      notes: data.notes,
      userId: user.id,
      role: user.role,
    });

    return jsonSuccess(record, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
