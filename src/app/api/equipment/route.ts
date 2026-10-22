import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { EQUIPMENT_CATEGORIES, EquipmentService } from "@/services/equipment-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "projects:read");
    return jsonSuccess(await EquipmentService.list(user));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(120),
  category: z.enum(EQUIPMENT_CATEGORIES),
  ownership: z.enum(["OWNED", "HIRED"]),
  vendorPartyId: z.string().nullable().optional(),
  hireRate: z.number().int().positive().max(1e10).nullable().optional(), // paise
  hireRateUnit: z.enum(["HOUR", "DAY", "MONTH"]).nullable().optional(),
  currentProjectId: z.string().nullable().optional(),
  nextServiceDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    return jsonSuccess(await EquipmentService.create(user, schema.parse(await req.json())), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
