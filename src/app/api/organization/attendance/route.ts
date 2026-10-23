import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { ATTENDANCE_DEFAULTS, attendanceRules, DEFAULT_GEOFENCE_M } from "@/lib/attendance-rules";
import { istDateKey } from "@/lib/ist-date";

export const dynamic = "force-dynamic";

async function sitesAndToday(organizationId: string) {
  const [sites, today] = await Promise.all([
    prisma.site.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, name: true, code: true, address: true, latitude: true, longitude: true, geofenceM: true },
      orderBy: { name: "asc" },
    }),
    prisma.staffAttendance.findMany({
      where: { organizationId, workDate: istDateKey() },
      include: { user: { select: { name: true } } },
      orderBy: { checkInAt: "asc" },
    }),
  ]);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  return {
    sites: sites.map((s) => ({ ...s, radius: s.geofenceM || DEFAULT_GEOFENCE_M })),
    today: today
      .filter((r) => r.status === "PRESENT" || r.status === "HALF_DAY")
      .map((r) => ({
        id: r.id,
        name: r.user.name,
        at: r.checkInAt,
        flag: r.checkInFlag,
        site: r.checkInSiteId ? siteName.get(r.checkInSiteId) || null : null,
        distanceM: r.checkInDistanceM,
        selfie: r.checkInSelfie,
        lat: r.checkInLat,
        lng: r.checkInLng,
      })),
  };
}

/** Settings → Attendance: check-in rules, site locations, and today's check-ins. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    return jsonSuccess({ rules: await attendanceRules(user.organizationId), ...(await sitesAndToday(user.organizationId)) });
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  rules: z.object({ requireGps: z.boolean().optional(), requireSelfie: z.boolean().optional(), blockOffSite: z.boolean().optional() }).optional(),
  site: z
    .object({
      id: z.string().min(1),
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
      geofenceM: z.number().int().min(50).max(5000).nullable().optional(),
    })
    .optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    const input = schema.parse(await req.json());
    if (input.site) {
      const site = await prisma.site.findFirst({ where: { id: input.site.id, organizationId: user.organizationId } });
      if (!site) return jsonError("Site not found", "NOT_FOUND", 404);
      if ((input.site.latitude == null) !== (input.site.longitude == null)) return jsonError("Give both latitude and longitude, or neither.", "BAD_REQUEST", 400);
      await prisma.site.update({
        where: { id: site.id },
        data: { latitude: input.site.latitude, longitude: input.site.longitude, ...(input.site.geofenceM !== undefined ? { geofenceM: input.site.geofenceM } : {}) },
      });
      await prisma.auditEvent.create({
        data: { organizationId: user.organizationId, actorUserId: user.userId, action: "SITE_LOCATION_SET", entityType: "SITE", entityId: site.id, afterJson: JSON.stringify(input.site) },
      });
    }
    if (input.rules) {
      const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { settingsJson: true } });
      let all: any = {};
      try {
        all = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
      } catch {
        all = {};
      }
      const next = { ...ATTENDANCE_DEFAULTS, ...(all.attendance || {}), ...input.rules };
      await prisma.organization.update({ where: { id: user.organizationId }, data: { settingsJson: JSON.stringify({ ...all, attendance: next }) } });
      await prisma.auditEvent.create({
        data: { organizationId: user.organizationId, actorUserId: user.userId, action: "ATTENDANCE_RULES_UPDATED", entityType: "ORGANIZATION", entityId: user.organizationId, afterJson: JSON.stringify(next) },
      });
    }
    return jsonSuccess({ rules: await attendanceRules(user.organizationId), ...(await sitesAndToday(user.organizationId)) });
  } catch (error) {
    return handleApiError(error);
  }
}
