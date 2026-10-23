import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BUYER_COOKIE, buyerPhone, portalGate } from "@/services/buyer-sign-in";

/**
 * For the buyer's pages: 404 for a wrong link, and the sign-in page when the
 * builder asks buyers to sign in with a code. Returns the signed-in mobile.
 */
export async function requireBuyerAccess(portalToken: string, back: string) {
  const phone = await buyerPhone(cookies().get(BUYER_COOKIE)?.value);
  const gate = await portalGate(portalToken, phone);
  if (!gate) notFound();
  if (gate === "SIGN_IN") redirect(`/portal/sign-in?next=${encodeURIComponent(back)}`);
  return phone;
}
