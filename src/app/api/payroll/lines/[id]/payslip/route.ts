import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { hasPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { PayrollService } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

/** One payslip. Payroll staff can see any; a staff member can see their own. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    const slip = await PayrollService.payslip(user.organizationId, params.id);
    const own = slip && slip.personType === "STAFF" && slip.personId === user.userId;
    if (!slip || (!own && !hasPermission(user.role, "payroll:read"))) return jsonError("Payslip not found", "NOT_FOUND", 404);
    return jsonSuccess(slip);
  } catch (error) {
    return handleApiError(error);
  }
}
