import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { attendanceShiftSettings, saveAttendanceShiftSettings } from "@/lib/attendance-rules";

export const dynamic = "force-dynamic";

const shiftItemSchema = z.object({
  code: z.enum(["GENERAL", "DAY", "NIGHT"]),
  name: z.string().min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid start time (HH:mm)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid end time (HH:mm)"),
  durationHours: z.number().min(1).max(24),
});

const updateShiftsSchema = z.object({
  enableCheckoutReminder: z.boolean().optional(),
  reminderGraceMinutes: z.number().int().min(0).max(180).optional(),
  standardWorkHours: z.number().min(4).max(16).optional(),
  shifts: z.array(shiftItemSchema).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const settings = await attendanceShiftSettings(user.organizationId);
    return jsonSuccess(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const isPrivileged = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
    if (!isPrivileged) {
      return jsonError("Forbidden: Only Admin and Super Admin can alter shift timings and checkout reminder policies.", "FORBIDDEN", 403);
    }

    const body = await req.json();
    const data = updateShiftsSchema.parse(body);

    const updated = await saveAttendanceShiftSettings(user.organizationId, data);

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "SHIFT_TIMINGS_UPDATED",
        entityType: "ORGANIZATION",
        entityId: user.organizationId,
        reason: "Shift timings and checkout reminder policies altered by Admin",
        afterJson: JSON.stringify(updated),
      },
    });

    return jsonSuccess({
      message: "Shift timings and checkout reminder settings saved successfully.",
      settings: updated,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
