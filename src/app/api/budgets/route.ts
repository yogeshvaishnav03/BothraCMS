import { NextRequest } from "next/server";
import { requireUserContext, requirePermission, getUserAccessibleProjectIds } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { ProjectBudgetService } from "@/services/project-budget-service";
import { MilestoneService } from "@/services/milestone-service";

export const dynamic = "force-dynamic";

/** Every project the person can see: budget used, spend, progress and delayed stages. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");
    const accessible = await getUserAccessibleProjectIds(user);
    const rows = await ProjectBudgetService.getPortfolio(user.organizationId, accessible);
    const progress = await MilestoneService.progressByProject(user.organizationId, rows.map((r) => r.projectId));
    return jsonSuccess(
      rows.map((r) => ({ ...r, progress: progress.get(r.projectId)?.progress ?? null, delayedStages: progress.get(r.projectId)?.delayed ?? 0 }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}
