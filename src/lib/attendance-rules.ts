import { prisma } from "@/lib/db";

/**
 * Checks on staff check-in: where the phone was, and a selfie.
 *
 * Each site can have a location (set by standing on the site and pressing
 * "Use my location") and a radius. A check-in is matched to the nearest site
 * with a location; further than its radius it is marked "away from site".
 * By default that is only flagged for the office to see. The company can
 * also make the location or a selfie compulsory, or refuse check-ins away
 * from every site.
 *
 * Rules live in the organization's settings under `attendance`.
 */

export interface AttendanceRules {
  requireGps: boolean;
  requireSelfie: boolean;
  blockOffSite: boolean;
}

export const ATTENDANCE_DEFAULTS: AttendanceRules = { requireGps: false, requireSelfie: false, blockOffSite: false };
export const DEFAULT_GEOFENCE_M = 300;

export async function attendanceRules(organizationId: string): Promise<AttendanceRules> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settingsJson: true } });
  let settings: any = {};
  try {
    settings = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
  } catch {
    settings = {};
  }
  return { ...ATTENDANCE_DEFAULTS, ...(settings.attendance || {}) };
}

/** Metres between two points on the earth (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
}

/** "450 m" or "2.3 km". */
export const distanceText = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/**
 * Where a check-in was: the nearest site with a location, how far, and a flag.
 * No sites with a location means nothing to compare against, so no flag.
 */
export async function placeCheckIn(organizationId: string, pos: { lat?: number | null; lng?: number | null }) {
  const sites = await prisma.site.findMany({
    where: { organizationId, status: "ACTIVE", latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, latitude: true, longitude: true, geofenceM: true },
  });
  if (pos.lat == null || pos.lng == null) return { siteId: null, siteName: null, distanceM: null, flag: sites.length ? ("NO_GPS" as const) : null };
  if (!sites.length) return { siteId: null, siteName: null, distanceM: null, flag: null };
  const here = { lat: pos.lat, lng: pos.lng };
  const nearest = sites
    .map((s) => ({ ...s, d: distanceM(here, { lat: s.latitude!, lng: s.longitude! }) }))
    .sort((a, b) => a.d - b.d)[0];
  const radius = nearest.geofenceM || DEFAULT_GEOFENCE_M;
  return { siteId: nearest.id, siteName: nearest.name, distanceM: nearest.d, flag: nearest.d > radius ? ("OFF_SITE" as const) : null };
}
