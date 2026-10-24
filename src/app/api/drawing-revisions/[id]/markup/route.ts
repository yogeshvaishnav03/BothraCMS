import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { DrawingService } from "@/services/drawing-service";

export const dynamic = "force-dynamic";

const frac = z.number().min(-0.05).max(1.05);
const shape = z
  .object({
    type: z.enum(["pen", "arrow", "rect", "cloud", "text"]),
    color: z.enum(["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#111827"]),
    points: z.array(z.tuple([frac, frac])).min(1).max(2000),
    text: z.string().trim().max(300).optional(),
  })
  .refine((s) => (s.type === "text" ? !!s.text : s.type === "pen" ? s.points.length >= 2 : s.points.length === 2), "Each mark needs its points (and text for a note)");
const schema = z.object({ page: z.number().int().min(1).max(500), shapes: z.array(shape).max(500) });

/** Saves the signed-in person's marks on one page of the revision. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    const body = schema.parse(await req.json());
    const row = await DrawingService.saveMarkup(user, params.id, body.page, body.shapes as any);
    return jsonSuccess({ saved: !!row, updatedAt: row?.updatedAt ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}
