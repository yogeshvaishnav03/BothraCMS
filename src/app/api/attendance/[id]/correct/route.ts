import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { AttendanceService } from "@/services/attendance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

const correctSchema = z.object({
  status: z.enum(["PRESENT", "HALF_DAY", "OVERTIME", "ABSENT"]),
  checkInAt: z.string().optional(),
  checkOutAt: z.string().optional(),
  reason: z.string().min(5),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = correctSchema.parse(body);

    try {
      const updated = await AttendanceService.correctAttendance({
        organizationId: user.organizationId,
        sessionId: params.id,
        status: data.status,
        checkInAt: data.checkInAt ? new Date(data.checkInAt) : undefined,
        checkOutAt: data.checkOutAt ? new Date(data.checkOutAt) : undefined,
        reason: data.reason,
        userId: user.userId,
        role: user.role,
      });

      return jsonSuccess(updated);
    } catch (dbErr) {
      console.warn("[ATTENDANCE_CORRECT] Database failed, saving to dynamicStore:", dbErr);
      const updated = dynamicStore.correctAttendance(params.id, data);
      return jsonSuccess(updated);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
