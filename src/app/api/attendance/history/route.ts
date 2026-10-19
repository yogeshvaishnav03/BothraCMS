import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const monthsParam = parseInt(searchParams.get("months") || "3", 10);
    const targetMonths = isNaN(monthsParam) || monthsParam <= 0 ? 3 : monthsParam;

    // Calculate start date (N months ago from the 1st of that month)
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - targetMonths);
    const startDateStr = startDate.toISOString().split("T")[0];

    const todayStr = new Date().toISOString().split("T")[0];

    // Resolve associated workforce member for the user
    const userEmpCode = `USR-${user.userId.slice(-6).toUpperCase()}`;
    const member = await prisma.workforceMember.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [
          { employeeCode: userEmpCode },
          ...(user.name ? [{ name: user.name }] : []),
        ],
      },
    });

    const whereConditions: any[] = [{ createdBy: user.userId }];
    if (member) {
      whereConditions.push({ workforceMemberId: member.id });
    }

    // Fetch past attendance sessions
    const sessions = await prisma.attendanceSession.findMany({
      where: {
        organizationId: user.organizationId,
        workDate: { gte: startDateStr },
        OR: whereConditions,
        isArchived: false,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        workforceMember: { select: { id: true, name: true, employeeCode: true, workerType: true } },
      },
      orderBy: [{ workDate: "desc" }, { checkInAt: "desc" }],
    });

    // Enrich sessions with formatted hours and duration
    const enrichedSessions = sessions.map((s) => {
      let durationMinutes = 0;
      if (s.checkInAt && s.checkOutAt) {
        durationMinutes = Math.max(
          0,
          Math.round((new Date(s.checkOutAt).getTime() - new Date(s.checkInAt).getTime()) / 60000)
        );
      } else if (s.checkInAt && s.workDate === todayStr) {
        durationMinutes = Math.max(
          0,
          Math.round((Date.now() - new Date(s.checkInAt).getTime()) / 60000)
        );
      }

      const hours = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      const durationFormatted =
        durationMinutes > 0
          ? `${hours > 0 ? `${hours}h ` : ""}${mins}m`
          : s.checkOutAt
          ? "0m"
          : "In Progress";

      return {
        id: s.id,
        workDate: s.workDate,
        status: s.status,
        checkInAt: s.checkInAt,
        checkInLat: s.checkInLat,
        checkInLng: s.checkInLng,
        checkOutAt: s.checkOutAt,
        checkOutLat: s.checkOutLat,
        checkOutLng: s.checkOutLng,
        durationMinutes,
        durationFormatted,
        durationHours: parseFloat((durationMinutes / 60).toFixed(1)),
        site: s.site,
        project: s.project,
        notes: s.notes,
        correctionReason: s.correctionReason,
        isToday: s.workDate === todayStr,
      };
    });

    // Check today's active status
    const todaySession = enrichedSessions.find((s) => s.workDate === todayStr) || null;

    // Monthly breakdown (e.g. 2026-10, 2026-09, 2026-08)
    const monthsMap = new Map<string, { monthKey: string; label: string; count: number; totalMinutes: number }>();

    // Generate past N month keys in order
    for (let i = 0; i < targetMonths; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const key = `${year}-${month}`;
      const monthName = d.toLocaleString("default", { month: "long" });
      monthsMap.set(key, {
        monthKey: key,
        label: `${monthName} ${year}`,
        count: 0,
        totalMinutes: 0,
      });
    }

    enrichedSessions.forEach((s) => {
      const key = s.workDate.slice(0, 7);
      if (monthsMap.has(key)) {
        const item = monthsMap.get(key)!;
        item.count += 1;
        item.totalMinutes += s.durationMinutes;
      }
    });

    const monthsBreakdown = Array.from(monthsMap.values()).map((m) => ({
      ...m,
      totalHours: parseFloat((m.totalMinutes / 60).toFixed(1)),
    }));

    // Overall metrics for the 3-month window
    const totalDaysPresent = enrichedSessions.length;
    const completedShifts = enrichedSessions.filter((s) => !!s.checkOutAt).length;
    const totalMinutesLogged = enrichedSessions.reduce((acc, s) => acc + s.durationMinutes, 0);
    const totalHoursLogged = parseFloat((totalMinutesLogged / 60).toFixed(1));
    const averageDailyHours =
      totalDaysPresent > 0 ? parseFloat((totalHoursLogged / totalDaysPresent).toFixed(1)) : 0;

    return jsonSuccess({
      employee: {
        id: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeCode: member?.employeeCode || userEmpCode,
      },
      todaySession,
      metrics: {
        targetMonths,
        totalDaysPresent,
        completedShifts,
        totalHoursLogged,
        averageDailyHours,
      },
      monthsBreakdown,
      sessions: enrichedSessions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
