import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { isDateKey } from "@/lib/ist-date";
import { ExportService, type ExportPart } from "@/services/export-service";

export const dynamic = "force-dynamic";

function range(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isDateKey(from) || !isDateKey(to) || from > to) return null;
  return { from, to };
}

/** What a given date range would export. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");
    const r = range(req);
    if (!r) return jsonError("Pick a from and to date.", "BAD_REQUEST", 400);
    return jsonSuccess(await ExportService.summary(user.organizationId, r.from, r.to));
  } catch (error) {
    return handleApiError(error);
  }
}
