import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requireProjectAccess, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { COST_HEAD_KEYS, ProjectBudgetService } from "@/services/project-budget-service";

export const dynamic = "force-dynamic";

/** Budget vs actual for one project, by cost head. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    await requireProjectAccess(user, params.id, "finance:read");
    const data = await ProjectBudgetService.getProjectBudget(user.organizationId, params.id);
    if (!data) return jsonError("Project not found", "NOT_FOUND", 404);
    return jsonSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}

const saveSchema = z.object({
  lines: z
    .array(
      z.object({
        costHead: z.enum(COST_HEAD_KEYS),
        budgetAmount: z.number().min(0).max(1e13), // paise
        notes: z.string().max(500).nullable().optional(),
      })
    )
    .min(1)
    .max(COST_HEAD_KEYS.length),
});

/** Set the budget for each cost head (finance staff and admins). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");
    await requireProjectAccess(user, params.id);
    const body = saveSchema.parse(await req.json());
    await ProjectBudgetService.saveBudget(user.organizationId, params.id, user.userId, body.lines);
    return jsonSuccess(await ProjectBudgetService.getProjectBudget(user.organizationId, params.id));
  } catch (error) {
    return handleApiError(error);
  }
}
