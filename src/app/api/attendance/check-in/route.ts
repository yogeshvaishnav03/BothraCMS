import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { AttendanceService } from "@/services/attendance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const checkInSchema = z.object({
  workforceMemberId: z.string().min(1),
  siteId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  workDate: z.string().optional(),
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
    const data = checkInSchema.parse(body);

    const workDate = data.workDate || new Date().toISOString().split("T")[0];

    const session = await AttendanceService.checkIn({
      organizationId: user.organizationId,
      workforceMemberId: data.workforceMemberId,
      siteId: data.siteId,
      projectId: data.projectId,
      workDate,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracyM: data.accuracyM,
      notes: data.notes,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess(session, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
