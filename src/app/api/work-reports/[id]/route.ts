import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireTeamWorkManage } from "@/lib/team-access";
import { WorkReportService } from "@/services/work-report-service";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  status: z.enum(["REVIEWED", "NEEDS_INFO"]),
  note: z.string().max(1000).nullable().optional(),
});

/** Admin marks a report reviewed, or asks for more detail. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requireTeamWorkManage(user);
    const body = reviewSchema.parse(await req.json());
    return jsonSuccess(await WorkReportService.review(user.organizationId, user.userId, params.id, body));
  } catch (error) {
    return handleApiError(error);
  }
}
