import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { QualitySafetyService } from "@/services/quality-safety-service";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["CLOSE", "REOPEN"]), note: z.string().max(1000).nullable().optional() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    const body = schema.parse(await req.json());
    await QualitySafetyService.verify(user, params.id, body.action, body.note);
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
