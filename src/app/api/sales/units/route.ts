import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { SalesService, UNIT_TYPES } from "@/services/sales-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:read");
    return jsonSuccess(await SalesService.units(user, new URL(req.url).searchParams.get("projectId")));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  projectId: z.string().min(1),
  unitNumbers: z.array(z.string().trim().min(1).max(20)).min(1).max(500),
  unitType: z.enum(UNIT_TYPES),
  floor: z.string().max(20).nullable().optional(),
  areaSqft: z.number().positive().max(1e6).nullable().optional(),
  price: z.number().int().min(0).max(1e13), // paise
});

/** Add units to a project's sales inventory. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:write");
    const added = await SalesService.addUnits(user, schema.parse(await req.json()));
    return jsonSuccess({ added }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
