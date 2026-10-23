import { NextRequest, NextResponse } from "next/server";
import { onlinePaymentReturn } from "@/services/online-payments";

export const dynamic = "force-dynamic";

/** Razorpay sends the buyer back here after paying (or giving up), with a signed result. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  let out: Awaited<ReturnType<typeof onlinePaymentReturn>> = { token: null, result: "unknown" };
  try {
    out = await onlinePaymentReturn({
      paymentId: sp.get("razorpay_payment_id") || "",
      linkId: sp.get("razorpay_payment_link_id") || "",
      referenceId: sp.get("razorpay_payment_link_reference_id") || "",
      status: sp.get("razorpay_payment_link_status") || "",
      signature: sp.get("razorpay_signature") || "",
    });
  } catch (err) {
    console.warn("Notice: online payment return failed:", (err as Error)?.message);
  }
  if (!out.token) return new NextResponse("This payment link is not known here.", { status: 404 });
  const result = out.result === "paid" ? "paid" : out.result === "not-paid" ? "not-paid" : "check";
  return NextResponse.redirect(new URL(`/portal/${out.token}?payment=${result}`, req.url), 303);
}
