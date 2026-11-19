import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { LiquidatedDamagesService } from "@/services/liquidated-damages-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const waiveSchema = z.object({
  waiveReason: z.string().min(3, "Reason for waiving deduction is required"),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { damageId: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const body = await req.json();
    const data = waiveSchema.parse(body);

    const record = await LiquidatedDamagesService.waiveDamage({
      organizationId: user.organizationId,
      id: params.damageId,
      waiveReason: data.waiveReason,
      userId: user.id,
      role: user.role,
    });

    return jsonSuccess(record);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { damageId: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const { searchParams } = new URL(req.url);
    const waiveReason = searchParams.get("reason") || "Waived by authorized administrator";

    const record = await LiquidatedDamagesService.waiveDamage({
      organizationId: user.organizationId,
      id: params.damageId,
      waiveReason,
      userId: user.id,
      role: user.role,
    });

    return jsonSuccess(record);
  } catch (error) {
    return handleApiError(error);
  }
}
