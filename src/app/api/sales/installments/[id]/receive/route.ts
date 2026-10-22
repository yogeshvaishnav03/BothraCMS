import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  amount: z.number().int().positive().max(1e13), // paise
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  mode: z.enum(["NEFT_RTGS", "UPI", "CHEQUE", "CASH", "HOME_LOAN"]),
  reference: z.string().max(80).nullable().optional(),
});

/** Record money received from the customer (accounts and admins). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");
    await SalesService.receive(user, params.id, schema.parse(await req.json()));
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
