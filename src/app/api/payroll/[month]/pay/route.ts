import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { PayrollService } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  method: z.enum(["BANK_TRANSFER", "NEFT_RTGS", "UPI", "CASH", "CHEQUE"]),
  payingAccount: z.string().max(120).nullable().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Record the salary and wage payments for an approved payroll. */
export async function POST(req: NextRequest, { params }: { params: { month: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:write");
    requirePermission(user, "finance:write");
    const body = schema.parse(await req.json());
    await PayrollService.markPaid(user, params.month, body);
    return jsonSuccess({ run: await PayrollService.getRun(user.organizationId, params.month) });
  } catch (error) {
    return handleApiError(error);
  }
}
