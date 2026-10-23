import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { PayrollService, isMonthKey } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

/** Past payroll runs, plus the requested month in full (?month=YYYY-MM). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:read");
    const month = new URL(req.url).searchParams.get("month");
    const [runs, run, gaps] = await Promise.all([
      PayrollService.listRuns(user.organizationId),
      isMonthKey(month) ? PayrollService.getRun(user.organizationId, month) : null,
      isMonthKey(month) ? PayrollService.statutoryGaps(user.organizationId, month) : null,
    ]);
    return jsonSuccess({ runs, run, gaps });
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM") });

/** Work out (or refresh) a month's payroll from attendance. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:write");
    const { month } = schema.parse(await req.json());
    await PayrollService.generate(user, month);
    return jsonSuccess({ run: await PayrollService.getRun(user.organizationId, month) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
