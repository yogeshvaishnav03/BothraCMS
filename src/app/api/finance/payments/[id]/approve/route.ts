import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const canApprove = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
    if (!canApprove) {
      return jsonError(
        "Super Admin or Organization Admin credentials required to approve payment disbursements",
        "FORBIDDEN",
        403
      );
    }

    let notes: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.notes === "string") {
        notes = body.notes.trim();
      }
    } catch {
      // Body is optional
    }

    const updatedPayment = await FinanceService.approvePayment({
      organizationId: user.organizationId,
      paymentId: params.id,
      userId: user.userId,
      role: user.role,
      approverName: user.name,
      notes,
    });

    return jsonSuccess({
      payment: updatedPayment,
      message: `Payment disbursement of ₹${(updatedPayment.amount / 100).toFixed(2)} to ${updatedPayment.recipientName || updatedPayment.party?.name || "recipient"} confirmed and approved from ${updatedPayment.payingAccount || "operating account"}.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
