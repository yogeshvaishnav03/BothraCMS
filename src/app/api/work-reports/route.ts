import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { isDateKey } from "@/lib/ist-date";
import { sanitizePhotoUrls } from "@/services/task-timeline-service";
import { WorkReportService } from "@/services/work-report-service";
import { onceOnly } from "@/lib/offline-send";

export const dynamic = "force-dynamic";

/** The signed-in person's own reports, newest first. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    return jsonSuccess(await WorkReportService.listOwn(user.organizationId, user.userId));
  } catch (error) {
    return handleApiError(error);
  }
}

const reportSchema = z.object({
  reportDate: z.string().refine(isDateKey, "reportDate must be YYYY-MM-DD"),
  summary: z.string().trim().min(5, "Write at least a line about what you did").max(5000),
  hoursWorked: z.number().min(0).max(24).nullable().optional(),
  projectId: z.string().nullable().optional(),
  blockers: z.string().max(2000).nullable().optional(),
  tomorrowPlan: z.string().max(2000).nullable().optional(),
  photoUrls: z.array(z.string()).max(12).optional(),
});

/** File or update the signed-in person's report for a date. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    return await onceOnly(req, user, async () => {
      const body = reportSchema.parse(await req.json());
      const report = await WorkReportService.upsert(user.organizationId, user.userId, {
        ...body,
        photoUrls: sanitizePhotoUrls(body.photoUrls),
      });
      return jsonSuccess(report, 201);
    });
  } catch (error) {
    return handleApiError(error);
  }
}
