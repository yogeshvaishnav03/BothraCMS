import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { DrawingService } from "@/services/drawing-service";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["APPROVE", "ISSUE", "REJECT"]), note: z.string().max(1000).nullable().optional() });

/** Approve, issue for construction, or send back a drawing revision. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    const body = schema.parse(await req.json());
    await DrawingService.review(user, params.id, body.action, body.note);
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
