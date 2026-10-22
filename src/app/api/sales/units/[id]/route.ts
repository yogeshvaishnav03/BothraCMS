import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

const schema = z.object({ price: z.number().int().min(0).max(1e13).optional(), status: z.enum(["AVAILABLE", "HOLD"]).optional() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:write");
    await SalesService.updateUnit(user, params.id, schema.parse(await req.json()));
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
