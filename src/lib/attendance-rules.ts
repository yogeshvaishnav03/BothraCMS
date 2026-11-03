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
 * Rules and Shift Policies live in the organization's settings under `attendance` and `shiftTiming`.
 */

export interface AttendanceRules {
  requireGps: boolean;
  requireSelfie: boolean;
  blockOffSite: boolean;
}

export interface ShiftTimingConfig {
  code: "GENERAL" | "DAY" | "NIGHT";
  name: string;
  startTime: string; // e.g. "09:30" (24-hour HH:mm)
  endTime: string;   // e.g. "18:30" (24-hour HH:mm)
  durationHours: number; // e.g. 9
}

export interface AttendanceShiftSettings {
  enableCheckoutReminder: boolean;
  reminderGraceMinutes: number; // e.g. 15 mins after shift finishes
  standardWorkHours: number; // e.g. 8.0
  shifts: ShiftTimingConfig[];
}

export const DEFAULT_SHIFT_SETTINGS: AttendanceShiftSettings = {
  enableCheckoutReminder: true,
  reminderGraceMinutes: 15,
  standardWorkHours: 8,
  shifts: [
    { code: "GENERAL", name: "General Shift", startTime: "09:30", endTime: "18:30", durationHours: 9 },
    { code: "DAY", name: "Morning / Day Shift", startTime: "08:00", endTime: "17:00", durationHours: 9 },
    { code: "NIGHT", name: "Night Shift", startTime: "20:00", endTime: "05:00", durationHours: 9 },
  ],
};

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

export async function attendanceShiftSettings(organizationId: string): Promise<AttendanceShiftSettings> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settingsJson: true } });
  let settings: any = {};
  try {
    settings = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
  } catch {
    settings = {};
  }
  const saved = settings.shiftTiming || {};
  return {
    enableCheckoutReminder: saved.enableCheckoutReminder ?? DEFAULT_SHIFT_SETTINGS.enableCheckoutReminder,
    reminderGraceMinutes: saved.reminderGraceMinutes ?? DEFAULT_SHIFT_SETTINGS.reminderGraceMinutes,
    standardWorkHours: saved.standardWorkHours ?? settings.workDayHours ?? DEFAULT_SHIFT_SETTINGS.standardWorkHours,
    shifts: Array.isArray(saved.shifts) && saved.shifts.length > 0 ? saved.shifts : DEFAULT_SHIFT_SETTINGS.shifts,
  };
}

export async function saveAttendanceShiftSettings(
  organizationId: string,
  updates: Partial<AttendanceShiftSettings>
): Promise<AttendanceShiftSettings> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settingsJson: true } });
  let settings: any = {};
  try {
    settings = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
  } catch {
    settings = {};
  }
  const current = await attendanceShiftSettings(organizationId);
  const next: AttendanceShiftSettings = {
    ...current,
    ...updates,
    shifts: updates.shifts || current.shifts,
  };

  settings.shiftTiming = next;
  if (next.standardWorkHours) {
    settings.workDayHours = next.standardWorkHours;
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settingsJson: JSON.stringify(settings) },
  });

  return next;
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
