import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const canReject = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
    if (!canReject) {
      return jsonError(
        "Super Admin or Organization Admin credentials required to reject payment disbursements",
        "FORBIDDEN",
        403
      );
    }

    let reason = "Payment disbursement rejected by Super Admin";
    try {
      const body = await req.json();
      if (body && typeof body.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      // Use default reason
    }

    const updatedPayment = await FinanceService.rejectPayment({
      organizationId: user.organizationId,
      paymentId: params.id,
      userId: user.userId,
      role: user.role,
      rejectorName: user.name,
      reason,
    });

    return jsonSuccess({
      payment: updatedPayment,
      message: `Payment disbursement query of ₹${(updatedPayment.amount / 100).toFixed(2)} to ${updatedPayment.recipientName || updatedPayment.party?.name || "recipient"} rejected.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
