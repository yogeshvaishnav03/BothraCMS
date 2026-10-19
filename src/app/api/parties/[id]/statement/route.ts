import { NextRequest } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { FinanceService } from "@/services/finance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");

    const statement = await FinanceService.getPartyStatement(
      user.organizationId,
      params.id
    );

    return jsonSuccess(statement);
  } catch (error) {
    return handleApiError(error);
  }
}
