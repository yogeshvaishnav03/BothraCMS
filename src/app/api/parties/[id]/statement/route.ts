import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    try {
      const statement = await FinanceService.getPartyStatement(
        user.organizationId,
        params.id
      );

      return jsonSuccess(statement);
    } catch {
      return jsonSuccess(dynamicStore.getPartyStatement(params.id));
    }
  } catch (error) {
    return handleApiError(error);
  }
}
