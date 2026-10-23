import { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { onlinePaymentWebhook } from "@/services/online-payments";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook (event payment_link.paid), checked with the webhook secret
 * from Settings → Online payments. Books the receipt even if the buyer closed
 * the page before coming back.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    return jsonSuccess(await onlinePaymentWebhook(raw, req.headers.get("x-razorpay-signature")));
  } catch (error) {
    return handleApiError(error);
  }
}
