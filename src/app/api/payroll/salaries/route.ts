import { NextRequest } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { PayrollService } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

/** Staff with their monthly salary, site workers' PF/ESI, and everyone who can be given an advance. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:read");
    const [staff, people, workers] = await Promise.all([
      PayrollService.listProfiles(user.organizationId),
      PayrollService.people(user.organizationId),
      PayrollService.listWorkers(user.organizationId),
    ]);
    return jsonSuccess({ staff, people, workers });
  } catch (error) {
    return handleApiError(error);
  }
}
