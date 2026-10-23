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

const PARTS: ExportPart[] = ["bills", "payments", "receipts"];

/** Downloads: tally (XML), gst-sales, purchases or payments (CSV). */
export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:read");
    const r = range(req);
    if (!r) return jsonError("Pick a from and to date.", "BAD_REQUEST", 400);
    const org = user.organizationId;
    const stamp = `${r.from}_to_${r.to}`;
    let body: string;
    let type = "text/csv; charset=utf-8";
    let name: string;
    switch (params.kind) {
      case "tally": {
        const asked = (req.nextUrl.searchParams.get("parts") || PARTS.join(",")).split(",").filter((p): p is ExportPart => (PARTS as string[]).includes(p));
        if (asked.length === 0) return jsonError("Pick at least one of bills, payments or receipts.", "BAD_REQUEST", 400);
        body = (await ExportService.tallyXml(org, r.from, r.to, asked)).xml;
        type = "application/xml; charset=utf-8";
        name = `tally-vouchers_${stamp}.xml`;
        break;
      }
      case "gst-sales":
        body = "\ufeff" + (await ExportService.gstSalesCsv(org, r.from, r.to));
        name = `gst-sales-register_${stamp}.csv`;
        break;
      case "purchases":
        body = "\ufeff" + (await ExportService.purchasesCsv(org, r.from, r.to));
        name = `purchase-register_${stamp}.csv`;
        break;
      case "payments":
        body = "\ufeff" + (await ExportService.paymentsCsv(org, r.from, r.to));
        name = `payments_${stamp}.csv`;
        break;
      default:
        return jsonError("Unknown export", "NOT_FOUND", 404);
    }
    await prisma.auditEvent.create({
      data: { organizationId: org, actorUserId: user.userId, action: "ACCOUNTS_EXPORTED", entityType: "ORGANIZATION", entityId: org, afterJson: JSON.stringify({ kind: params.kind, ...r }) },
    });
    return new NextResponse(body, {
      headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
