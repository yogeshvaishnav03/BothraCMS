import { NextRequest, NextResponse } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { handleApiError, jsonError } from "@/lib/api-response";
import { PayrollService, isMonthKey } from "@/services/payroll-service";

export const dynamic = "force-dynamic";

/** PF ECR (?kind=pf-ecr) or ESI contribution file (?kind=esi) for the month. */
export async function GET(req: NextRequest, { params }: { params: { month: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:write");
    if (!isMonthKey(params.month)) return jsonError("Use YYYY-MM", "BAD_REQUEST", 400);
    const kind = new URL(req.url).searchParams.get("kind");
    if (kind !== "pf-ecr" && kind !== "esi") return jsonError("kind must be pf-ecr or esi", "BAD_REQUEST", 400);
    const file = await PayrollService.statutoryFile(user, params.month, kind);
    return new NextResponse(file.body, {
      headers: {
        "Content-Type": `${file.type}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
