import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { fetchDayBookData } from "@/services/day-book-service";
import { DayBookSeedService } from "@/services/day-book-seed-service";
import { checkDemoSeedAllowed } from "@/lib/demo-seed-guard";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const todayStr = new Date().toISOString().split("T")[0];
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const dateParam = searchParams.get("date");

    const from = fromParam || dateParam || todayStr;
    const to = toParam || dateParam || from;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return jsonError("Validation error: date — Use the format YYYY-MM-DD", "VALIDATION_ERROR", 422);
    }
    const siteId = searchParams.get("siteId") || undefined;
    const orgId = user.organizationId;

    // Days with no activity simply return empty data. Demo data is only
    // ever created through the explicit Super Admin POST below.
    const data = await fetchDayBookData(orgId, from, to, siteId);
    const hasFinance = hasPermission(user.role, "finance:read");
    if (!hasFinance) {
      data.payments = [];
      data.bills = [];
      data.summary.totalPaymentsAmount = 0;
      data.summary.paymentsCount = 0;
      data.summary.totalBillsAmount = 0;
      data.summary.billsCount = 0;
      data.summary.rejectedPaymentsCount = 0;
      data.summary.totalRejectedPaymentsAmount = 0;
    }
    // Customer receipts are for people who see sales or finance.
    if (!hasFinance && !hasPermission(user.role, "sales:read")) {
      data.moneyIn = [];
      data.summary.totalMoneyInAmount = 0;
      data.summary.moneyInCount = 0;
    }

    return jsonSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const denial = checkDemoSeedAllowed(user.role);
    if (denial) return jsonError(denial.message, denial.code, denial.status);

    const body = await req.json().catch(() => ({}));
    const todayStr = new Date().toISOString().split("T")[0];
    const date = body.date || todayStr;
    const orgId = user.organizationId;

    await DayBookSeedService.seedDemoDataForOrg(orgId, date);
    const data = await fetchDayBookData(orgId, date, body.siteId);

    return jsonSuccess({
      message: "Day Book demo data seeded successfully",
      ...data,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
