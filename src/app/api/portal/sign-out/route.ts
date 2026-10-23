import { jsonSuccess } from "@/lib/api-response";
import { BUYER_COOKIE } from "@/services/buyer-sign-in";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = jsonSuccess({ signedOut: true });
  res.cookies.set(BUYER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
