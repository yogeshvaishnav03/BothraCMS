import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { canUser } from "@/lib/permissions";
import { PayrollService } from "@/services/payroll-service";
import { fyOf, isFy } from "@/lib/income-tax";
import { istDateKey } from "@/lib/ist-date";

export const dynamic = "force-dynamic";

/** Yearly salary and tax statement (?fy=2026-27). Payroll staff see anyone's; everyone sees their own. */
export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const user = await requireUserContext(req);
    if (params.userId !== user.userId && !canUser(user, "payroll:read")) return jsonError("Not allowed", "FORBIDDEN", 403);
    const fy = new URL(req.url).searchParams.get("fy") || fyOf(istDateKey().slice(0, 7));
    if (!isFy(fy)) return jsonError("Use a financial year like 2026-27", "BAD_REQUEST", 400);
    return jsonSuccess(await PayrollService.taxStatement(user.organizationId, params.userId, fy));
  } catch (error) {
    return handleApiError(error);
  }
}
