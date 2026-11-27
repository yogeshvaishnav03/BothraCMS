import { NextRequest } from "next/server";
import { requireUserContext, isOrgOwnerOrAdmin, AuthorizationError } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { CommandCenterService } from "@/services/command-center-service";
import { ensurePostgresColumns } from "@/lib/db";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    if (!isOrgOwnerOrAdmin(user)) {
      throw new AuthorizationError("Forbidden: The Command Center is only available to admins", 403, "FORBIDDEN");
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || todayIst();
    if (!DATE_RE.test(date)) {
      return jsonError("Validation error: date — Use the format YYYY-MM-DD", "VALIDATION_ERROR", 422);
    }
    const siteId = searchParams.get("siteId") || undefined;

    await ensurePostgresColumns().catch(() => {});

    try {
      const data = await CommandCenterService.getOverview(user.organizationId, date, siteId);
      return jsonSuccess(data);
    } catch (innerError: any) {
      console.error("[COMMAND_CENTER_API] Error generating overview:", innerError);
      return jsonSuccess({
        date,
        summary: {
          totalPaymentsAmount: 0,
          totalRejectedPaymentsAmount: 0,
          totalBillsAmount: 0,
          totalMoneyInAmount: 0,
          moneyInCount: 0,
          paymentsCount: 0,
          rejectedPaymentsCount: 0,
          billsCount: 0,
          receiptsCount: 0,
          issuesCount: 0,
          workersPresentCount: 0,
          headcountTotal: 0,
          headcountArtisans: 0,
          headcountCraftsmen: 0,
          headcountLaborers: 0,
          staffPresentCount: 0,
          reportsCount: 0,
        },
        timeline: [],
        timelineTotal: 0,
        attention: {
          openSafety: 0,
          drawingsWaiting: 0,
          payrollDraft: 0,
          equipmentDown: 0,
          customerOverdue: 0,
        },
        approvals: {
          paymentsPendingCount: 0,
          paymentsPendingAmount: 0,
          pendingPaymentsList: [],
          ordersPendingCount: 0,
          materialRequestsPending: 0,
        },
        payments: [],
        bills: [],
        unpaidBills: [],
        projects: [],
        finance: {
          outstandingPayables: 0,
          trend: [],
        },
        team: [],
        activity: [],
        taskFeed: [],
        people: {
          expected: 0,
          submitted: 0,
          present: 0,
          onLeave: 0,
          hours: 0,
          withBlockers: 0,
          missing: [],
        },
        recentActivityDates: [],
        dueTasks: [],
        dueTasksCount: 0,
        overdueTasksCount: 0,
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
