import { NextRequest, NextResponse } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { handleApiError, jsonError } from "@/lib/api-response";
import { PayrollService, isMonthKey } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

/** CSV for the bank's bulk salary upload. Full account numbers, so payroll:write only. */
export async function GET(req: NextRequest, { params }: { params: { month: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:write");
    if (!isMonthKey(params.month)) return jsonError("Use YYYY-MM", "BAD_REQUEST", 400);
    const body = await PayrollService.bankFile(user, params.month);
    return new NextResponse("\ufeff" + body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="salary-transfer_${params.month}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
