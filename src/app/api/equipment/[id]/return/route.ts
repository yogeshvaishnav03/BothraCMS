import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { EquipmentService } from "@/services/equipment-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    await EquipmentService.returnHired(user, params.id);
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
