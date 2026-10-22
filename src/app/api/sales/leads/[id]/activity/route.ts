import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { LEAD_STAGES, SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["CALL", "WHATSAPP", "SITE_VISIT", "MEETING", "NOTE"]),
  note: z.string().trim().min(1).max(1000),
  stage: z.enum(LEAD_STAGES).nullable().optional(),
  nextFollowUp: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  lostReason: z.string().max(300).nullable().optional(),
});

/** Log a call, visit or note on a lead, and move it along the pipeline. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:write");
    await SalesService.logActivity(user, params.id, schema.parse(await req.json()));
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
