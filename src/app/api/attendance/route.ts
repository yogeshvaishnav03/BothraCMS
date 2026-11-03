import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { AttendanceService } from "@/services/attendance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId") || undefined;
    const workDate = searchParams.get("workDate") || undefined;

    const records = await AttendanceService.getDailyAttendance(
      user.organizationId,
      siteId,
      workDate
    );

    return jsonSuccess(records);
  } catch (error) {
    return handleApiError(error);
  }
}

const alterAttendanceSchema = z.object({
  userId: z.string().min(1, "Target staff member is required"),
  siteId: z.string().min(1, "Site is required"),
  projectId: z.string().optional(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  status: z.enum(["PRESENT", "HALF_DAY", "OVERTIME", "ABSENT", "ON_LEAVE"]),
  checkInAt: z.string().optional(),
  checkOutAt: z.string().optional(),
  shift: z.enum(["GENERAL", "DAY", "NIGHT"]).default("GENERAL"),
  reason: z.string().min(5, "Justification must be at least 5 characters"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const isPrivileged = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
    if (!isPrivileged) {
      return jsonError("Forbidden: Only Admin and Super Admin can alter attendance for other staff members.", "FORBIDDEN", 403);
    }

    const body = await req.json();
    const data = alterAttendanceSchema.parse(body);

    const result = await AttendanceService.recordOrAlterStaffAttendance({
      organizationId: user.organizationId,
      userId: data.userId,
      siteId: data.siteId,
      projectId: data.projectId,
      workDate: data.workDate,
      status: data.status,
      checkInAt: data.checkInAt,
      checkOutAt: data.checkOutAt,
      shift: data.shift,
      reason: data.reason,
      actorUserId: user.userId,
      actorRole: user.role,
    });

    return jsonSuccess({
      message: `Attendance for ${result.workforceMember?.name || "staff"} successfully updated with audit trail.`,
      session: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
