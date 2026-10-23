import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

const schema = z.object({ milestoneId: z.string().min(1).nullable() });

/** Choose which project stage raises this instalment's demand. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:write");
    await SalesService.linkStage(user, params.id, schema.parse(await req.json()).milestoneId);
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
