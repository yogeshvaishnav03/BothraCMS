import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

const schema = z.object({ dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() });

/** The stage is reached: this construction-linked instalment falls due. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:write");
    const dueDate = await SalesService.raiseDemand(user, params.id, schema.parse(await req.json()).dueDate);
    return jsonSuccess({ dueDate });
  } catch (error) {
    return handleApiError(error);
  }
}
