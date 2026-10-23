import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { istDateKey, monthDays } from "@/lib/ist-date";
import { StaffAttendanceError, StaffAttendanceService, hoursBetween } from "@/services/staff-attendance-service";
import { onceOnly } from "@/lib/offline-send";

export const dynamic = "force-dynamic";

/** The signed-in person's attendance: today plus this month. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const today = istDateKey();
    const days = monthDays(today.slice(0, 7));
    const [todayRow, monthRows] = await Promise.all([
      StaffAttendanceService.today(user.organizationId, user.userId),
      prisma.staffAttendance.findMany({
        where: { organizationId: user.organizationId, userId: user.userId, workDate: { gte: days[0], lte: days[days.length - 1] } },
        orderBy: { workDate: "asc" },
      }),
    ]);
    return jsonSuccess({
      date: today,
      today: todayRow,
      month: monthRows.map((r) => ({ ...r, hours: hoursBetween(r.checkInAt, r.checkOutAt) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const actionSchema = z.object({
  action: z.enum(["check-in", "check-out"]),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  /** When the phone had no signal: the time the button was pressed, sent later. */
  at: z.string().datetime({ offset: true }).optional(),
});

/** A late-sent check-in keeps its real time, if it is from the last 18 hours. */
const OFFLINE_WINDOW_MS = 18 * 3600_000;

function pressedAt(at: string | undefined) {
  if (!at) return { now: new Date(), offline: false };
  const t = new Date(at);
  const age = Date.now() - t.getTime();
  if (age < -2 * 60_000 || age > OFFLINE_WINDOW_MS) throw new StaffAttendanceError("This check-in was saved too long ago to send. Ask an admin to mark the day.", 422, "TOO_OLD");
  return { now: t, offline: true };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    return await onceOnly(req, user, async () => {
      const body = actionSchema.parse(await req.json());
      const { now, offline } = pressedAt(body.at);
      const note = offline ? [body.note?.trim(), "Saved on phone with no signal, sent later"].filter(Boolean).join(" · ") : body.note;
      const row =
        body.action === "check-in"
          ? await StaffAttendanceService.checkIn(user.organizationId, user.userId, { ...body, note }, now)
          : await StaffAttendanceService.checkOut(user.organizationId, user.userId, body, now);
      return jsonSuccess({ ...row, hours: hoursBetween(row.checkInAt, row.checkOutAt) }, body.action === "check-in" ? 201 : 200);
    });
  } catch (error) {
    return handleApiError(error);
  }
}
