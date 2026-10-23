import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limiter";
import { BUYER_COOKIE, buyerPhone, portalGate } from "@/services/buyer-sign-in";
import { paymentBaseUrl, startOnlinePayment } from "@/services/online-payments";

export const dynamic = "force-dynamic";

/** "Pay now" on the buyer's page: a Razorpay link for one instalment's balance. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    if (!(await checkRateLimitAsync(`buyer-pay:${getClientIp(req)}`, 20, 15 * 60_000)).allowed) return jsonError("Too many tries. Wait a few minutes.", "TOO_MANY", 429);
    const gate = await portalGate(params.token, await buyerPhone(req.cookies.get(BUYER_COOKIE)?.value));
    if (!gate) return jsonError("This link is not valid.", "NOT_FOUND", 404);
    if (gate === "SIGN_IN") return jsonError("Sign in first.", "SIGN_IN", 401);
    const { installmentId } = z.object({ installmentId: z.string().min(1).max(64) }).parse(await req.json());
    const booking = await prisma.salesBooking.findUnique({ where: { portalToken: params.token }, select: { organizationId: true } });
    const baseUrl = await paymentBaseUrl(booking!.organizationId, req.nextUrl.origin);
    return jsonSuccess(await startOnlinePayment({ portalToken: params.token, installmentId, baseUrl }));
  } catch (error) {
    return handleApiError(error);
  }
}
