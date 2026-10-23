import { NextRequest } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { form16A, form16AList } from "@/services/tds-certificates";
import { fyOf, isFy } from "@/lib/income-tax";
import { istDateKey } from "@/lib/ist-date";

export const dynamic = "force-dynamic";

/**
 * TDS certificates for parties (Form 16A).
 * ?fy=2026-27&quarter=2 lists the parties with TDS in the quarter;
 * add &partyId=… for one party's certificate.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");
    const sp = req.nextUrl.searchParams;
    const fy = sp.get("fy") || fyOf(istDateKey().slice(0, 7));
    if (!isFy(fy)) return jsonError("Use a financial year like 2026-27", "BAD_REQUEST", 400);
    const q = Number(sp.get("quarter") || 1);
    if (![1, 2, 3, 4].includes(q)) return jsonError("Quarter is 1 to 4", "BAD_REQUEST", 400);
    const partyId = sp.get("partyId");
    if (!partyId) return jsonSuccess(await form16AList(user.organizationId, fy, q as 1 | 2 | 3 | 4));
    const cert = await form16A(user.organizationId, fy, q as 1 | 2 | 3 | 4, partyId);
    if (!cert) return jsonError("No TDS was held back from this party in that quarter.", "NOT_FOUND", 404);
    return jsonSuccess(cert);
  } catch (error) {
    return handleApiError(error);
  }
}
