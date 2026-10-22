import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { EquipmentService, LOG_KINDS } from "@/services/equipment-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(LOG_KINDS),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  projectId: z.string().nullable().optional(),
  hours: z.number().min(0).max(24).nullable().optional(),
  fuelLitres: z.number().min(0).max(10000).nullable().optional(),
  cost: z.number().int().min(0).max(1e10).nullable().optional(), // paise
  operator: z.string().max(100).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  nextServiceDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Log hours, fuel, a service, a breakdown or a move for a machine. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "tasks:write");
    return jsonSuccess(await EquipmentService.addLog(user, params.id, schema.parse(await req.json())), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
