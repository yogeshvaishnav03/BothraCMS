import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { AttendanceService } from "@/services/attendance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

const checkOutSchema = z.object({
  sessionId: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracyM: z.number().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = checkOutSchema.parse(body);

    try {
      const session = await AttendanceService.checkOut({
        organizationId: user.organizationId,
        sessionId: data.sessionId,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracyM: data.accuracyM,
        notes: data.notes,
        userId: user.userId,
        role: user.role,
      });

      return jsonSuccess(session);
    } catch (dbErr) {
      console.warn("[ATTENDANCE_CHECKOUT] Database failed, saving to dynamicStore:", dbErr);
      const session = dynamicStore.checkOut(data.sessionId);
      return jsonSuccess(session);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
