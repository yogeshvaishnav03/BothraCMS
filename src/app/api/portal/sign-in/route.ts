import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limiter";
import { requestCode } from "@/services/buyer-sign-in";

export const dynamic = "force-dynamic";

/** A buyer asks for a sign-in code on the mobile number of their booking. */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkRateLimitAsync(`buyer-code:${getClientIp(req)}`, 10, 15 * 60_000)).allowed) return jsonError("Too many tries. Wait 15 minutes.", "TOO_MANY", 429);
    const { phone } = z.object({ phone: z.string().min(10).max(20) }).parse(await req.json());
    return jsonSuccess(await requestCode(phone));
  } catch (error) {
    return handleApiError(error);
  }
}
