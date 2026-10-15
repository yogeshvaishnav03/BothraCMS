import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

const reverseSchema = z.object({
  reason: z.string().min(5),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const { reason } = reverseSchema.parse(body);

    try {
      const reversed = await FinanceService.reversePayment({
        organizationId: user.organizationId,
        paymentId: params.id,
        reason,
        userId: user.userId,
        role: user.role,
      });

      return jsonSuccess(reversed);
    } catch (dbErr) {
      console.warn("[PAYMENTS_REVERSE] Database failed, saving to dynamicStore:", dbErr);
      const reversed = dynamicStore.reversePayment(params.id, reason);
      return jsonSuccess(reversed);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
