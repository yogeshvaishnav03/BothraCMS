import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { DrawingService } from "@/services/drawing-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  fileUrl: z.string().max(200).nullable().optional(),
  fileName: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/** Upload the next revision of a drawing. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "projects:write");
    const revision = await DrawingService.addRevision(user, params.id, schema.parse(await req.json()));
    return jsonSuccess({ revision }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
