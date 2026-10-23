import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { bookRazorpayFees, razorpayFees } from "@/services/online-payments";

export const dynamic = "force-dynamic";

/** Razorpay's fees month by month, and whether each month is booked in Finance. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    return jsonSuccess({ months: await razorpayFees(user.organizationId) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Books one month's fees as a single bank charge payment to Razorpay. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    requirePermission(user, "finance:write");
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(await req.json());
    return jsonSuccess(await bookRazorpayFees(user, month), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
