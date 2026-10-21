import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { istDateKey, isDateKey } from "@/lib/ist-date";
import { requireTeamWorkManage, requireTeamWorkView } from "@/lib/team-access";
import { STAFF_STATUSES, StaffAttendanceService } from "@/services/staff-attendance-service";

export const dynamic = "force-dynamic";

/** Monthly attendance register for every staff member (admins and HR). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requireTeamWorkView(user);
    const month = new URL(req.url).searchParams.get("month") || istDateKey().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return jsonError("month must be YYYY-MM", "VALIDATION_ERROR", 422);
    return jsonSuccess(await StaffAttendanceService.register(user.organizationId, month));
  } catch (error) {
    return handleApiError(error);
  }
}

const markSchema = z.object({
  userId: z.string().min(1),
  date: z.string().refine(isDateKey, "date must be YYYY-MM-DD"),
  status: z.enum(STAFF_STATUSES),
  reason: z.string().max(300).optional(),
});

/** Admin marks a day as present, half day, leave or absent. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requireTeamWorkManage(user);
    const body = markSchema.parse(await req.json());
    const before = await prisma.staffAttendance.findUnique({
      where: { organizationId_userId_workDate: { organizationId: user.organizationId, userId: body.userId, workDate: body.date } },
    });
    const row = await StaffAttendanceService.setStatus(user.organizationId, body.userId, body.date, body.status);
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "STAFF_ATTENDANCE_MARKED",
        entityType: "STAFF_ATTENDANCE",
        entityId: row.id,
        beforeJson: before ? JSON.stringify({ status: before.status }) : null,
        afterJson: JSON.stringify({ status: row.status, userId: body.userId, date: body.date }),
        reason: body.reason || null,
      },
    });
    return jsonSuccess(row);
  } catch (error) {
    return handleApiError(error);
  }
}
