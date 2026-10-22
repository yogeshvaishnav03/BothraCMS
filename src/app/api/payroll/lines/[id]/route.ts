import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { PayrollService } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  bonus: z.number().int().min(0).max(1e10).optional(), // paise
  otherDeduction: z.number().int().min(0).max(1e10).optional(), // paise
  note: z.string().max(300).nullable().optional(),
});

/** Add a bonus, an extra deduction or a note to one person's line in a draft payroll. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:write");
    const body = schema.parse(await req.json());
    const month = await PayrollService.editLine(user, params.id, body);
    return jsonSuccess({ run: await PayrollService.getRun(user.organizationId, month) });
  } catch (error) {
    return handleApiError(error);
  }
}
