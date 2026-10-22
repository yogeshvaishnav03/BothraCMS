import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

/** One customer receipt, for printing. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "sales:read");
    const receipt = await SalesService.receipt(user.organizationId, params.id);
    if (!receipt) return jsonError("Receipt not found", "NOT_FOUND", 404);
    return jsonSuccess(receipt);
  } catch (error) {
    return handleApiError(error);
  }
}
