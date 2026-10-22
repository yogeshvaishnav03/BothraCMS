import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { PT_STATES, PayrollService, payrollSettings } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:read");
    return jsonSuccess({ ...(await payrollSettings(user.organizationId)), states: Object.entries(PT_STATES).map(([key, v]) => ({ key, name: v.name })) });
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({ ptState: z.string().min(1) });

/** Which state's professional tax applies to staff salaries. */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:write");
    await PayrollService.saveSettings(user, schema.parse(await req.json()));
    return jsonSuccess(await payrollSettings(user.organizationId));
  } catch (error) {
    return handleApiError(error);
  }
}
