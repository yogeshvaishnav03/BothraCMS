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
    const scopeParam = searchParams.get("scope");
    const siteIdParam = searchParams.get("siteId");

    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const isAdmin = user.role === "ORG_ADMIN";
    const isPrivileged = isSuperAdmin || isAdmin || ["HR_VIEWER", "AUDITOR"].includes(user.role);

    // If Super Admin: default scope is "all". If Org Admin: allow scope "all" or "self" (default "all")
    const fetchAll = isPrivileged && (scopeParam === "all" || (!scopeParam && (isSuperAdmin || isAdmin)));

    // Calculate start date (N months ago)
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - targetMonths);
    const startDateStr = startDate.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];

    // Resolve associated workforce member for the logged-in user
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

    // Query logged-in user's today session (for check-in / check-out state)
    const todaySessionRaw = await prisma.attendanceSession.findFirst({
      where: {
        organizationId: user.organizationId,
        workDate: todayStr,
        OR: [
          { createdBy: user.userId },
          ...(member ? [{ workforceMemberId: member.id }] : []),
        ],
        isArchived: false,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        workforceMember: { select: { id: true, name: true, employeeCode: true, workerType: true } },
        creator: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    let todaySession: any = null;
    if (todaySessionRaw) {
      let durMin = 0;
      if (todaySessionRaw.checkInAt && todaySessionRaw.checkOutAt) {
        durMin = Math.max(
          0,
          Math.round((new Date(todaySessionRaw.checkOutAt).getTime() - new Date(todaySessionRaw.checkInAt).getTime()) / 60000)
        );
      } else if (todaySessionRaw.checkInAt) {
        durMin = Math.max(0, Math.round((Date.now() - new Date(todaySessionRaw.checkInAt).getTime()) / 60000));
      }
      const hrs = Math.floor(durMin / 60);
      const mns = durMin % 60;
      todaySession = {
        id: todaySessionRaw.id,
        workDate: todaySessionRaw.workDate,
        status: todaySessionRaw.status,
        checkInAt: todaySessionRaw.checkInAt,
        checkInLat: todaySessionRaw.checkInLat,
        checkInLng: todaySessionRaw.checkInLng,
        checkOutAt: todaySessionRaw.checkOutAt,
        checkOutLat: todaySessionRaw.checkOutLat,
        checkOutLng: todaySessionRaw.checkOutLng,
        durationMinutes: durMin,
        durationFormatted:
          durMin > 0 ? `${hrs > 0 ? `${hrs}h ` : ""}${mns}m` : todaySessionRaw.checkOutAt ? "0m" : "In Progress",
        durationHours: parseFloat((durMin / 60).toFixed(1)),
        site: todaySessionRaw.site,
        project: todaySessionRaw.project,
        notes: todaySessionRaw.notes,
        isToday: true,
      };
    }

    // Prepare where clause for attendance history
    const sessionWhere: any = {
      organizationId: user.organizationId,
      workDate: { gte: startDateStr },
      isArchived: false,
    };

    if (siteIdParam && siteIdParam !== "ALL") {
      sessionWhere.siteId = siteIdParam;
    }

    if (!fetchAll) {
      const personalConditions: any[] = [{ createdBy: user.userId }];
      if (member) {
        personalConditions.push({ workforceMemberId: member.id });
      }
      sessionWhere.OR = personalConditions;
    }

    // Fetch past attendance sessions
    const sessions = await prisma.attendanceSession.findMany({
      where: sessionWhere,
      include: {
        site: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        workforceMember: { select: { id: true, name: true, employeeCode: true, workerType: true } },
        creator: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: [{ workDate: "desc" }, { checkInAt: "desc" }],
    });

    // Enrich sessions with formatted hours, duration, and staff details
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

      const employeeName = s.creator?.name || s.workforceMember?.name || "Staff Member";
      const employeeRole = s.creator?.role || s.workforceMember?.workerType || "STAFF";
      const employeeCode =
        s.workforceMember?.employeeCode || (s.creator ? `USR-${s.creator.id.slice(-6).toUpperCase()}` : "N/A");

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
        workforceMember: s.workforceMember,
        creator: s.creator,
        employeeName,
        employeeRole,
        employeeCode,
        employeeEmail: s.creator?.email || null,
        notes: s.notes,
        correctionReason: s.correctionReason,
        isToday: s.workDate === todayStr,
      };
    });

    // Monthly breakdown (e.g. 2026-10, 2026-09, 2026-08)
    const monthsMap = new Map<string, { monthKey: string; label: string; count: number; totalMinutes: number }>();

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

    // Calculate metrics
    const totalDaysPresent = enrichedSessions.length;
    const completedShifts = enrichedSessions.filter((s) => !!s.checkOutAt).length;
    const totalMinutesLogged = enrichedSessions.reduce((acc, s) => acc + s.durationMinutes, 0);
    const totalHoursLogged = parseFloat((totalMinutesLogged / 60).toFixed(1));
    const averageDailyHours =
      totalDaysPresent > 0 ? parseFloat((totalHoursLogged / totalDaysPresent).toFixed(1)) : 0;

    // Org-wide metrics for privileged viewers
    const activeStaffToday = enrichedSessions.filter((s) => s.isToday && !s.checkOutAt).length;
    const completedStaffToday = enrichedSessions.filter((s) => s.isToday && !!s.checkOutAt).length;
    const totalStaffOnSiteToday = activeStaffToday + completedStaffToday;
    const uniqueStaffCount = new Set(enrichedSessions.map((s) => s.employeeName + s.employeeCode)).size;

    return jsonSuccess({
      employee: {
        id: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeCode: member?.employeeCode || userEmpCode,
      },
      scope: fetchAll ? "all" : "self",
      canViewAll: isPrivileged,
      isSuperAdmin,
      isAdmin,
      todaySession,
      metrics: {
        targetMonths,
        totalDaysPresent,
        completedShifts,
        totalHoursLogged,
        averageDailyHours,
        activeStaffToday,
        completedStaffToday,
        totalStaffOnSiteToday,
        uniqueStaffCount,
      },
      monthsBreakdown,
      sessions: enrichedSessions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
