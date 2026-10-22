import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { DISCIPLINES, DrawingService } from "@/services/drawing-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "projects:read");
    const sp = new URL(req.url).searchParams;
    return jsonSuccess(await DrawingService.list(user, { projectId: sp.get("projectId"), discipline: sp.get("discipline"), q: sp.get("q") }));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  projectId: z.string().min(1),
  number: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(200),
  discipline: z.enum(DISCIPLINES),
  fileUrl: z.string().max(200).nullable().optional(),
  fileName: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/** Add a drawing to the register with its first revision (R0). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "projects:write");
    return jsonSuccess(await DrawingService.create(user, schema.parse(await req.json())), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
