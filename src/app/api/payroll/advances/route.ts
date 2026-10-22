import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { PayrollService } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:read");
    return jsonSuccess(await PayrollService.listAdvances(user.organizationId));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  personType: z.enum(["LABOUR", "STAFF"]),
  personId: z.string().min(1),
  amount: z.number().int().positive().max(1e10), // paise
  givenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

/** Record an advance; it is deducted in the next payroll. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:write");
    return jsonSuccess(await PayrollService.giveAdvance(user, schema.parse(await req.json())), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
