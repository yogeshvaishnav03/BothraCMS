import { NextRequest } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { isDateKey, istDateKey } from "@/lib/ist-date";
import { SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

/** Customer receipts between two dates (default: this month). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");
    const sp = req.nextUrl.searchParams;
    const today = istDateKey();
    const from = isDateKey(sp.get("from")) ? sp.get("from")! : `${today.slice(0, 7)}-01`;
    const to = isDateKey(sp.get("to")) ? sp.get("to")! : today;
    const rows = await SalesService.moneyIn(user.organizationId, from, to);
    return jsonSuccess({
      from,
      to,
      receipts: rows,
      total: rows.reduce((s, r) => s + r.amount, 0),
      gst: rows.reduce((s, r) => s + r.gstAmount, 0),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
