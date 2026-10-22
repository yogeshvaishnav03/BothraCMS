import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

/** Everything the printed demand letter needs. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:read");
    const letter = await SalesService.demand(user.organizationId, params.id);
    if (!letter) return jsonError("Instalment not found", "NOT_FOUND", 404);
    return jsonSuccess(letter);
  } catch (error) {
    return handleApiError(error);
  }
}
