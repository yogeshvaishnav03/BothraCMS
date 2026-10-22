import { NextRequest } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { PayrollService } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

/** An admin approves the month's payroll; after this it can be paid. */
export async function POST(req: NextRequest, { params }: { params: { month: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:write");
    await PayrollService.approve(user, params.month);
    return jsonSuccess({ run: await PayrollService.getRun(user.organizationId, params.month) });
  } catch (error) {
    return handleApiError(error);
  }
}
