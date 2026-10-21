import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { fetchDayBookData } from "@/services/day-book-service";
import { DayBookSeedService } from "@/services/day-book-seed-service";
import { checkDemoSeedAllowed } from "@/lib/demo-seed-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const todayStr = new Date().toISOString().split("T")[0];
    const date = searchParams.get("date") || todayStr;
    const siteId = searchParams.get("siteId") || undefined;
    const orgId = user.organizationId;

    // Days with no activity simply return empty data. Demo data is only
    // ever created through the explicit Super Admin POST below.
    const data = await fetchDayBookData(orgId, date, siteId);

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
