import { NextRequest } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { PayrollService } from "@/services/payroll-service";
import { csv } from "@/services/export-service";
import { fyOf, isFy } from "@/lib/income-tax";
import { istDateKey } from "@/lib/ist-date";

export const dynamic = "force-dynamic";

const rs = (paise: number) => Math.round(paise / 100);
/** The return utility wants dd/mm/yyyy. */
const ddmmyyyy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/**
 * Quarterly TDS return on salary (Form 24Q). ?fy=2026-27&quarter=3 gives the
 * figures; add &format=csv&part=deductees|challans|salary for a sheet to copy
 * into the return utility.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "payroll:read");
    const sp = req.nextUrl.searchParams;
    const now = istDateKey();
    const fy = sp.get("fy") || fyOf(now.slice(0, 7));
    if (!isFy(fy)) return jsonError("Use a financial year like 2026-27", "BAD_REQUEST", 400);
    const q = Number(sp.get("quarter") || 1);
    if (![1, 2, 3, 4].includes(q)) return jsonError("Quarter is 1 to 4", "BAD_REQUEST", 400);
    const data = await PayrollService.tdsReturn(user.organizationId, fy, q as 1 | 2 | 3 | 4);
    if (sp.get("format") !== "csv") return jsonSuccess(data);

    const part = sp.get("part") || "deductees";
    let rows: (string | number | null)[][];
    if (part === "challans") {
      rows = [
        ["Month", "TDS deducted (₹)", "Deposited (₹)", "Date deposited", "Challan / reference", "Due date", "Interest if late (₹)"],
        ...data.challans.map((c) => [c.month, rs(c.tds), rs(c.deposited), ddmmyyyy(c.depositedOn), c.reference, ddmmyyyy(c.due), c.interest ? rs(c.interest) : ""]),
      ];
    } else if (part === "salary") {
      if (!data.salaryForYear) return jsonError("Salary details for the year (Annexure II) are only in the fourth quarter", "BAD_REQUEST", 400);
      rows = [
        ["Name", "PAN", "Tax regime", "Gross salary (₹)", "Professional tax (₹)", "Deductions incl. standard (₹)", "Taxable income (₹)", "Tax with cess (₹)", "TDS deducted (₹)", "Shortfall (₹)"],
        ...data.salaryForYear.map((p) => [p.name, p.pan || "PANNOTAVBL", p.regime === "OLD" ? "Old" : "New (115BAC)", rs(p.gross), rs(p.professionalTax), rs(p.deductions), rs(p.taxable), rs(p.tax), rs(p.tdsDeducted), rs(p.shortfall)]),
      ];
    } else {
      rows = [
        ["Month", "Name", "PAN", "Section", "Date paid", "Amount paid (₹)", "TDS (₹)", "Date deducted", "New regime (115BAC)"],
        ...data.deductees.map((d) => [d.month, d.name, d.pan || "PANNOTAVBL", d.section, ddmmyyyy(d.paidOn), rs(d.amountPaid), rs(d.tds), ddmmyyyy(d.deductedOn), d.newRegime ? "Yes" : "No"]),
      ];
    }
    return new Response("﻿" + csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="24Q-${fy}-Q${q}-${part}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
