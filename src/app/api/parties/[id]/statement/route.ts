import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const statement = await FinanceService.getPartyStatement(
      user.organizationId,
      params.id
    );

    return jsonSuccess(statement);
  } catch (error) {
    return handleApiError(error);
  }
}
