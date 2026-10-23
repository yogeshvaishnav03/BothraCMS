import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { FinanceService } from "@/services/finance-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  partyId: z.string().min(1),
  amount: z.number().positive(),
  paymentDate: z.string(),
  allocations: z.array(z.object({ billId: z.string().min(1), amount: z.number().positive() })).optional(),
  tds: z.object({ mode: z.enum(["AUTO", "NONE", "MANUAL"]), amount: z.number().min(0).optional(), reason: z.string().max(200).nullable().optional() }).nullable().optional(),
});

/** What TDS a payment to this party would have held back, before it is saved. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");
    const body = schema.parse(await req.json());
    const tds = await FinanceService.contractorTds({ organizationId: user.organizationId, ...body, paymentDate: new Date(body.paymentDate) });
    return jsonSuccess(tds ? { ...tds, bankAmount: body.amount - tds.amount } : null);
  } catch (error) {
    return handleApiError(error);
  }
}
