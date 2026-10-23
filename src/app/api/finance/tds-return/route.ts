import { NextRequest } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { FinanceService } from "@/services/finance-service";
import { csv } from "@/services/export-service";
import { fyOf, isFy } from "@/lib/income-tax";
import { istDateKey } from "@/lib/ist-date";

export const dynamic = "force-dynamic";

const rs = (paise: number) => Math.round(paise / 100);
const ddmmyyyy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/**
 * Quarterly TDS return on contractor payments (Form 26Q, section 194C).
 * ?fy=2026-27&quarter=3, plus &format=csv&part=deductees|challans for a sheet.
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
    const data = await FinanceService.contractorTdsReturn(user.organizationId, fy, q as 1 | 2 | 3 | 4);
    if (sp.get("format") !== "csv") return jsonSuccess(data);

    const part = sp.get("part") || "deductees";
    const rows: (string | number | null)[][] =
      part === "challans"
        ? [
            ["Month", "TDS deducted (₹)", "Deposited (₹)", "Date deposited", "Challan / reference", "Due date", "Interest if late (₹)"],
            ...data.challans.map((c) => [c.month, rs(c.tds), rs(c.deposited), ddmmyyyy(c.depositedOn), c.reference, ddmmyyyy(c.due), c.interest ? rs(c.interest) : ""]),
          ]
        : [
            ["Month", "Contractor", "PAN", "Section", "Date paid / credited", "Amount (₹)", "Rate %", "TDS (₹)", "Date deducted", "Remark code", "Payment reference"],
            ...data.deductees.map((d) => [d.month, d.name, d.pan || "PANNOTAVBL", d.section, ddmmyyyy(d.paidOn), rs(d.amountPaid), d.rate, rs(d.tds), ddmmyyyy(d.deductedOn), d.remark, d.reference]),
          ];
    return new Response("﻿" + csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="26Q-${fy}-Q${q}-${part}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
