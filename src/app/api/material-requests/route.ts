import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { MaterialRequestService } from "@/services/material-request-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const sp = new URL(req.url).searchParams;
    return jsonSuccess(await MaterialRequestService.list(user, { status: sp.get("status"), projectId: sp.get("projectId") }));
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  projectId: z.string().min(1),
  neededBy: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !isNaN(d.getTime()), "Invalid date"),
  priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
  notes: z.string().max(2000).nullable().optional(),
  items: z
    .array(
      z.object({
        materialId: z.string().nullable().optional(),
        description: z.string().max(300).nullable().optional(),
        quantity: z.number().positive().max(1e9),
        unitCode: z.string().max(20).nullable().optional(),
      })
    )
    .min(1)
    .max(50),
});

/** Raise a material request for a project. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const body = createSchema.parse(await req.json());
    return jsonSuccess(await MaterialRequestService.create(user, body), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
