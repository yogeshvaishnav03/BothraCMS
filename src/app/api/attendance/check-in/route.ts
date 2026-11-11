import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { AttendanceService } from "@/services/attendance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

import { requireUserContext, requireProjectAccess } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const checkInSchema = z.object({
  workforceMemberId: z.string().min(1).optional(),
  siteId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  workDate: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracyM: z.number().optional(),
  notes: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = checkInSchema.parse(body);

    // If checking in a specific workforce member, require attendance:write permission
    const user = data.workforceMemberId
      ? await requireUserContext(req, "attendance:write")
      : await requireUserContext(req);

    if (data.projectId) {
      await requireProjectAccess(user, data.projectId, data.workforceMemberId ? "attendance:write" : undefined);
    }

    // MANDATORY GPS CHECK:
    // GPS capture is strictly mandatory before check-in can be submitted.
    // If coordinates are missing or invalid, reject immediately.
    if (!data.workforceMemberId && (data.latitude == null || data.longitude == null || isNaN(data.latitude) || isNaN(data.longitude))) {
      return jsonError("GPS location capture is mandatory before check-in can be submitted. Please allow location permissions in your browser or device.", "GPS_LOCATION_REQUIRED", 400);
    }

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
      attachmentIds: data.attachmentIds,
      userId: user.userId,
      role: user.role,
      permissions: user.permissions,
    });

    return jsonSuccess(session, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
