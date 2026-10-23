import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limiter";
import { BUYER_COOKIE, verifyCode } from "@/services/buyer-sign-in";

export const dynamic = "force-dynamic";

/** The buyer types the code. On success they stay signed in on this phone for 30 days. */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkRateLimitAsync(`buyer-verify:${getClientIp(req)}`, 20, 15 * 60_000)).allowed) return jsonError("Too many tries. Wait 15 minutes.", "TOO_MANY", 429);
    const { phone, code } = z.object({ phone: z.string().min(10).max(20), code: z.string().min(4).max(10) }).parse(await req.json());
    const { token, maxAge, homes } = await verifyCode(phone, code);
    const res = jsonSuccess({ homes });
    res.cookies.set(BUYER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge });
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
