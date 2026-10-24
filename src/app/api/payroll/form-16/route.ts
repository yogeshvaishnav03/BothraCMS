import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { canUser } from "@/lib/permissions";
import { fyOf, isFy } from "@/lib/income-tax";
import { istDateKey } from "@/lib/ist-date";
import { form16List, form16PartB } from "@/services/form16";

export const dynamic = "force-dynamic";

/**
 * Form 16 Part B. ?fy=2026-27 lists the staff paid a salary that year (payroll
 * staff only); add &userId= for one person's form. Everyone can open their own.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const sp = req.nextUrl.searchParams;
    const userId = sp.get("userId");
    if (userId !== user.userId && !canUser(user, "payroll:read")) return jsonError("Not allowed", "FORBIDDEN", 403);
    const now = istDateKey();
    // Form 16 is for a year that has ended, so the default is last year.
    const fy = sp.get("fy") || fyOf(`${Number(now.slice(0, 4)) - 1}${now.slice(4, 7)}`);
    if (!isFy(fy)) return jsonError("Use a financial year like 2026-27", "BAD_REQUEST", 400);
    if (!userId) return jsonSuccess(await form16List(user.organizationId, fy));
    const doc = await form16PartB(user.organizationId, userId, fy);
    if (!doc) return jsonError("No approved salary for this person in that year", "NOT_FOUND", 404);
    return jsonSuccess(doc);
  } catch (error) {
    return handleApiError(error);
  }
}
