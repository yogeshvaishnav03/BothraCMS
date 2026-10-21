import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { istDateKey, monthDays } from "@/lib/ist-date";
import { StaffAttendanceService, hoursBetween } from "@/services/staff-attendance-service";

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
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const body = actionSchema.parse(await req.json());
    const row =
      body.action === "check-in"
        ? await StaffAttendanceService.checkIn(user.organizationId, user.userId, body)
        : await StaffAttendanceService.checkOut(user.organizationId, user.userId, body);
    return jsonSuccess({ ...row, hours: hoursBetween(row.checkInAt, row.checkOutAt) }, body.action === "check-in" ? 201 : 200);
  } catch (error) {
    return handleApiError(error);
  }
}
