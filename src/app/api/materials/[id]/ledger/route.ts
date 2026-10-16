import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { InventoryService } from "@/services/inventory-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId") || undefined;

    const ledger = await InventoryService.getMaterialLedger(
      user.organizationId,
      params.id,
      storeId
    );

    return jsonSuccess(ledger);
  } catch (error) {
    return handleApiError(error);
  }
}
