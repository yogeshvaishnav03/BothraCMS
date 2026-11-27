import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
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
    const isPrivileged =
      isSuperAdmin ||
      isAdmin ||
      ["HR_VIEWER", "AUDITOR"].includes(user.role) ||
      hasPermission(user, "attendance:correct");

    // If Super Admin: default scope is "all". If Org Admin: allow scope "all" or "self" (default "all")
    const fetchAll = isPrivileged && (scopeParam === "all" || (!scopeParam && (isSuperAdmin || isAdmin)));

    // Calculate start date (N months ago)
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - targetMonths);
    const startDateStr = startDate.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];

    // Resolve associated workforce member for the logged-in user (prefer exact USR- code)
    const userEmpCode = `USR-${user.userId.slice(-6).toUpperCase()}`;
    const member =
      (await prisma.workforceMember.findFirst({
        where: { organizationId: user.organizationId, employeeCode: userEmpCode },
      })) ||
      (user.name
        ? await prisma.workforceMember.findFirst({
            where: { organizationId: user.organizationId, name: user.name },
          })
        : null);

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

    // Auto-resolve past un-checked-out sessions to HALF_DAY in background
    await prisma.attendanceSession.updateMany({
      where: {
        organizationId: user.organizationId,
        checkOutAt: null,
        workDate: { lt: todayStr },
        status: { in: ["PRESENT", "TODO"] },
      },
      data: {
        status: "HALF_DAY",
      },
    }).catch(() => {});

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
      const durHours = durMin / 60;
      let calculatedTodayStatus = todaySessionRaw.status || "PRESENT";
      if (todaySessionRaw.checkInAt && todaySessionRaw.checkOutAt) {
        if (!todaySessionRaw.correctionReason) {
          if (durHours < 3) {
            calculatedTodayStatus = "ABSENT";
          } else if (durHours < 7) {
            calculatedTodayStatus = "HALF_DAY";
          } else {
            calculatedTodayStatus = "PRESENT";
          }
        }
      }

      todaySession = {
        id: todaySessionRaw.id,
        workDate: todaySessionRaw.workDate,
        status: calculatedTodayStatus,
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

    // Fetch past attendance sessions and org users to resolve USR- linked live names
    const [sessions, orgUsers] = await Promise.all([
      prisma.attendanceSession.findMany({
        where: sessionWhere,
        include: {
          site: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          workforceMember: { select: { id: true, name: true, employeeCode: true, workerType: true } },
          creator: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: [{ workDate: "desc" }, { checkInAt: "desc" }],
      }),
      prisma.user.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true, email: true, role: true, status: true },
      }),
    ]);

    const LABOR_TRADES = new Set([
      "MASON",
      "CARPENTER",
      "ELECTRICIAN",
      "PLUMBER",
      "HELPER",
      "FOREMAN",
      "PAINTER",
      "WELDER",
      "FITTER",
      "BARBENDER",
      "BAR_BENDER",
      "LABOUR",
      "LABOR",
      "WORKER",
      "OPERATOR",
      "DRIVER",
      "PEON",
      "GUARD",
    ]);

    const userByEmpCode = new Map(
      orgUsers.filter((u) => u?.id).map((u) => [`USR-${u.id.slice(-6).toUpperCase()}`, u])
    );
    const userByName = new Map(
      orgUsers.filter((u) => u?.name).map((u) => [(u.name || "").toLowerCase().trim(), u])
    );
    const userById = new Map(
      orgUsers.filter((u) => u?.id).map((u) => [u.id, u])
    );

    // Filter sessions to Staff Attendance only (Site labor / muster roll entries are tracked in /attendance/muster)
    const staffSessions = sessions.filter((s) => {
      // Exclude site muster entries (created on Muster Roll page for site labor)
      if (s.notes === "Site muster" || s.notes?.includes("Site muster")) {
        return false;
      }

      const empCode = (s.workforceMember?.employeeCode || "").trim().toUpperCase();
      const workerType = (s.workforceMember?.workerType || "").trim().toUpperCase();

      // If linked to an organization User via USR- code, it is definitively staff
      if (empCode.startsWith("USR-") || userByEmpCode.has(empCode)) {
        return true;
      }

      // If member name matches a system User, it is staff
      if (s.workforceMember?.name && userByName.has(s.workforceMember.name.toLowerCase().trim())) {
        return true;
      }

      // If creator is a system user and worker is not an explicit labor trade
      if (s.createdBy && userById.has(s.createdBy) && !LABOR_TRADES.has(workerType)) {
        // Exclude explicit worker codes (EMP- or WRK-) when not mapped to an org user
        if (empCode.startsWith("EMP-") || empCode.startsWith("WRK-")) {
          return false;
        }
        return true;
      }

      // Exclude all labor trades (Helper, Mason, Electrician, Carpenter, Plumber)
      if (LABOR_TRADES.has(workerType)) {
        return false;
      }

      // Exclude any worker code not associated with a user
      if (empCode.startsWith("EMP-") || empCode.startsWith("WRK-")) {
        return false;
      }

      return true;
    });

    // Enrich sessions with formatted hours, duration, and staff details
    const enrichedSessions = staffSessions.map((s) => {
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

      const linkedUser =
        (s.workforceMember?.employeeCode ? userByEmpCode.get(s.workforceMember.employeeCode) : undefined) ||
        (s.workforceMember?.name ? userByName.get(s.workforceMember.name.toLowerCase().trim()) : undefined) ||
        (s.createdBy ? userById.get(s.createdBy) : undefined);
      const employeeName =
        (linkedUser?.name || s.workforceMember?.name || s.creator?.name || "Staff Member").trim() || "Staff Member";
      const employeeRole =
        linkedUser?.role ||
        (s.workforceMember?.workerType && !LABOR_TRADES.has(s.workforceMember.workerType.toUpperCase()) ? s.workforceMember.workerType : null) ||
        s.creator?.role ||
        "STAFF";
      const employeeCode =
        s.workforceMember?.employeeCode || (s.creator?.id ? `USR-${s.creator.id.slice(-6).toUpperCase()}` : "N/A");

      // Shift status calculation based on rules:
      // 1. If user forgot to check out on past day -> HALF_DAY
      // 2. If user checked in and out:
      //    < 3 hours -> ABSENT
      //    3 hours to 7 hours -> HALF_DAY
      //    >= 7 hours -> PRESENT
      let calculatedStatus = s.status || "PRESENT";
      if (!s.checkOutAt && s.workDate < todayStr) {
        calculatedStatus = "HALF_DAY";
      } else if (s.checkInAt && s.checkOutAt) {
        if (!s.correctionReason) {
          const workedHours = durationMinutes / 60;
          if (workedHours < 3) {
            calculatedStatus = "ABSENT";
          } else if (workedHours < 7) {
            calculatedStatus = "HALF_DAY";
          } else {
            calculatedStatus = "PRESENT";
          }
        }
      }

      return {
        id: s.id,
        workDate: s.workDate,
        status: calculatedStatus,
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
        workforceMember: s.workforceMember ? { ...s.workforceMember, name: linkedUser?.name || s.workforceMember.name } : null,
        creator: s.creator,
        employeeName,
        employeeRole,
        employeeCode,
        employeeEmail: linkedUser?.email || s.creator?.email || null,
        notes: s.notes,
        correctionReason: s.correctionReason,
        isToday: s.workDate === todayStr,
      };
    });

    // Identify staff who did NOT click check-in today
    const checkedInUserIds = new Set<string>();
    for (const s of enrichedSessions) {
      if (s.isToday) {
        if (s.creator?.id) checkedInUserIds.add(s.creator.id);
        const empCode = s.workforceMember?.employeeCode;
        if (empCode && userByEmpCode.has(empCode)) {
          const u = userByEmpCode.get(empCode);
          if (u?.id) checkedInUserIds.add(u.id);
        }
        const name = s.workforceMember?.name?.toLowerCase().trim();
        if (name && userByName.has(name)) {
          const u = userByName.get(name);
          if (u?.id) checkedInUserIds.add(u.id);
        }
      }
    }

    const activeStaff = orgUsers.filter((u) => u.status === "ACTIVE" || !u.status);
    const absentTodaySessions: any[] = [];

    // When viewing all sites (or site not filtered), show active staff who didn't check in today as ABSENT
    if (!siteIdParam || siteIdParam === "ALL") {
      const candidates = fetchAll
        ? activeStaff
        : activeStaff.filter((u) => u.id === user.userId);

      for (const u of candidates) {
        if (!checkedInUserIds.has(u.id)) {
          absentTodaySessions.push({
            id: `absent-${u.id}-${todayStr}`,
            workDate: todayStr,
            status: "ABSENT",
            isNotCheckedIn: true,
            checkInAt: null,
            checkInLat: null,
            checkInLng: null,
            checkOutAt: null,
            checkOutLat: null,
            checkOutLng: null,
            durationMinutes: 0,
            durationFormatted: "0m",
            durationHours: 0,
            site: null,
            project: null,
            workforceMember: null,
            creator: { id: u.id, name: u.name, email: u.email, role: u.role },
            employeeName: u.name || "Staff Member",
            employeeRole: u.role || "STAFF",
            employeeCode: `USR-${u.id.slice(-6).toUpperCase()}`,
            employeeEmail: u.email,
            notes: "No check-in recorded (Absent)",
            correctionReason: null,
            isToday: true,
          });
        }
      }
    }

    const finalSessions = [...enrichedSessions, ...absentTodaySessions];

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

    finalSessions.forEach((s) => {
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

    // Calculate metrics:
    // Full day (PRESENT) = 1.0 day
    // Half day (HALF_DAY) = 0.5 day
    // Absent (ABSENT) = 0
    const totalDaysPresent = finalSessions.reduce((acc, s) => {
      if (s.status === "HALF_DAY") return acc + 0.5;
      if (s.status === "ABSENT" || s.isNotCheckedIn) return acc;
      return acc + 1;
    }, 0);
    const completedShifts = finalSessions.filter((s) => !!s.checkOutAt).length;
    const totalMinutesLogged = finalSessions.reduce((acc, s) => acc + s.durationMinutes, 0);
    const totalHoursLogged = parseFloat((totalMinutesLogged / 60).toFixed(1));
    const averageDailyHours =
      totalDaysPresent > 0 ? parseFloat((totalHoursLogged / totalDaysPresent).toFixed(1)) : 0;

    // Org-wide metrics for privileged viewers
    const activeStaffToday = finalSessions.filter((s) => s.isToday && !s.checkOutAt && !s.isNotCheckedIn).length;
    const completedStaffToday = finalSessions.filter((s) => s.isToday && !!s.checkOutAt).length;
    const absentStaffToday = finalSessions.filter((s) => s.isToday && (s.status === "ABSENT" || s.isNotCheckedIn)).length;
    const halfDayStaffToday = finalSessions.filter((s) => s.isToday && s.status === "HALF_DAY").length;
    const totalStaffOnSiteToday = activeStaffToday + completedStaffToday;
    const uniqueStaffCount = new Set(finalSessions.map((s) => s.employeeName + s.employeeCode)).size;

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
        absentStaffToday,
        halfDayStaffToday,
        totalStaffOnSiteToday,
        uniqueStaffCount,
      },
      monthsBreakdown,
      sessions: finalSessions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
