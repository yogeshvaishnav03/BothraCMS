import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { QualitySafetyService } from "@/services/quality-safety-service";

export const dynamic = "force-dynamic";

const schema = z.object({ resolution: z.string().trim().min(3).max(2000), photoUrls: z.array(z.string()).max(12).optional() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "tasks:write");
    await QualitySafetyService.resolve(user, params.id, schema.parse(await req.json()));
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
