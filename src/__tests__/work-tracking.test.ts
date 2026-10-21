import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { PATCH as setStatus } from "@/app/api/tasks/[id]/status/route";
import { PATCH as editTask } from "@/app/api/tasks/[id]/route";
import { POST as postUpdate } from "@/app/api/tasks/[id]/updates/route";
import { GET as getTimeline } from "@/app/api/tasks/[id]/timeline/route";
import { GET as myAttendance, POST as attendanceAction } from "@/app/api/staff-attendance/route";
import { GET as register, PATCH as markDay } from "@/app/api/staff-attendance/register/route";
import { POST as fileReport } from "@/app/api/work-reports/route";
import { GET as draftReport } from "@/app/api/work-reports/draft/route";
import { GET as overview } from "@/app/api/work-reports/overview/route";
import { PATCH as reviewReport } from "@/app/api/work-reports/[id]/route";
import { CommandCenterService } from "@/services/command-center-service";
import { istDateKey } from "@/lib/ist-date";

const stamp = Date.now();
let orgId = "";
const ids = { admin: "", engineer: "", supervisor: "", project: "", task: "" };
const names: Record<string, string> = { admin: "Owner Bothra", engineer: "Priya Engineer", supervisor: "Ravi Supervisor" };
const roles: Record<string, string> = { admin: "ORG_ADMIN", engineer: "PROJECT_MANAGER", supervisor: "SITE_SUPERVISOR" };

function as(who: keyof typeof names) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId: ids[who as keyof typeof ids],
    organizationId: orgId,
    email: `${who}@test.local`,
    name: names[who],
    role: roles[who] as any,
    organizationName: "Work Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });
const taskParams = () => ({ params: { id: ids.task } });

describe("Task history, admin updates, work reports and staff attendance", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Work Org ${stamp}` } });
    orgId = org.id;
    for (const who of ["admin", "engineer", "supervisor"] as const) {
      const u = await prisma.user.create({
        data: { organizationId: orgId, name: names[who], email: `${who}-${stamp}@test.local`, passwordHash: "x", role: roles[who] },
      });
      ids[who] = u.id;
    }
    const site = await prisma.site.create({ data: { organizationId: orgId, name: "Tower Site", code: `TS-${stamp}`, address: "Jaipur" } });
    const project = await prisma.project.create({
      data: { organizationId: orgId, siteId: site.id, code: `P-${stamp}`, name: "Tower B", managerUserId: ids.engineer },
    });
    ids.project = project.id;
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        title: "Slab shuttering 3rd floor",
        createdBy: ids.engineer,
        assigneeUserId: ids.supervisor,
      },
    });
    ids.task = task.id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  const notificationsFor = (userId: string) =>
    prisma.notification.findMany({ where: { organizationId: orgId, userId, type: "TASK_UPDATE" }, orderBy: { createdAt: "desc" } });

  it("a status change reaches the admin and the assigner, not the person who made it", async () => {
    as("supervisor");
    const res = await setStatus(req(`/api/tasks/${ids.task}/status`, "PATCH", { status: "IN_PROGRESS" }), taskParams());
    expect(res.status).toBe(200);

    const [adminNote] = await notificationsFor(ids.admin);
    expect(adminNote.title).toContain("In progress");
    expect(adminNote.href).toBe(`/tasks?task=${ids.task}`);
    expect((await notificationsFor(ids.engineer)).length).toBe(1);
    expect((await notificationsFor(ids.supervisor)).length).toBe(0);
  });

  it("a progress update with photos is one commit in the history; foreign urls are dropped", async () => {
    as("supervisor");
    const res = await postUpdate(
      req(`/api/tasks/${ids.task}/updates`, "POST", {
        status: "BLOCKED",
        note: "Waiting for plywood sheets",
        photoUrls: ["/api/uploads/abc123", "https://evil.example/x.png"],
      }),
      taskParams()
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    const top = data.entries[0];
    expect(top.kind).toBe("STATUS");
    expect(top.note).toBe("Waiting for plywood sheets");
    expect(top.photos).toEqual([{ url: "/api/uploads/abc123" }]);
    expect(top.hash).toMatch(/^[0-9a-f]{7}$/);
    // The note did not also appear as a separate comment entry.
    expect(data.entries.filter((e: any) => e.kind === "UPDATE")).toHaveLength(0);

    const [adminNote] = await notificationsFor(ids.admin);
    expect(adminNote.severity).toBe("WARNING");
    expect(adminNote.message).toContain("1 photo");
  });

  it("refuses an empty update", async () => {
    as("supervisor");
    const res = await postUpdate(req(`/api/tasks/${ids.task}/updates`, "POST", { note: "  " }), taskParams());
    expect(res.status).toBe(422);
  });

  it("an edit shows the before and after values, and both assignees hear about a reassignment", async () => {
    as("engineer");
    const res = await editTask(
      req(`/api/tasks/${ids.task}`, "PATCH", { assigneeUserId: ids.admin, priority: "HIGH", reason: "Ravi on leave" }),
      taskParams()
    );
    expect(res.status).toBe(200);

    const timeline = await (await getTimeline(req(`/api/tasks/${ids.task}/timeline`), taskParams())).json();
    const edit = timeline.data.entries.find((e: any) => e.kind === "EDIT");
    expect(edit.note).toBe("Ravi on leave");
    expect(edit.changes).toEqual(
      expect.arrayContaining([
        { field: "assigneeUserId", label: "Assigned to", from: "Ravi Supervisor", to: "Owner Bothra" },
        { field: "priority", label: "Priority", from: "MEDIUM", to: "HIGH" },
      ])
    );
    const kinds = timeline.data.entries.map((e: any) => e.kind);
    expect(kinds[kinds.length - 1]).toBe("CREATED");

    const supNotes = await prisma.notification.findMany({ where: { organizationId: orgId, userId: ids.supervisor } });
    expect(supNotes.some((n) => n.title.includes("edited"))).toBe(true);
  });

  it("staff check in and out once a day", async () => {
    as("supervisor");
    const first = await attendanceAction(req("/api/staff-attendance", "POST", { action: "check-in", lat: 26.9, lng: 75.8 }));
    expect(first.status).toBe(201);
    const again = await attendanceAction(req("/api/staff-attendance", "POST", { action: "check-in" }));
    expect(again.status).toBe(409);
    const out = await attendanceAction(req("/api/staff-attendance", "POST", { action: "check-out" }));
    expect(out.status).toBe(200);
    // Moments after check-in counts as a half day.
    expect((await out.json()).data.status).toBe("HALF_DAY");

    const mine = await (await myAttendance(req("/api/staff-attendance"))).json();
    expect(mine.data.today.checkOutAt).toBeTruthy();
    expect(mine.data.month).toHaveLength(1);
  });

  it("only admins and HR see the register, and only admins can mark leave", async () => {
    as("supervisor");
    expect((await register(req("/api/staff-attendance/register"))).status).toBe(403);
    expect((await overview(req("/api/work-reports/overview"))).status).toBe(403);

    as("admin");
    const month = istDateKey().slice(0, 7);
    const yesterday = `${month}-01`;
    const marked = await markDay(req("/api/staff-attendance/register", "PATCH", { userId: ids.engineer, date: yesterday, status: "LEAVE" }));
    expect(marked.status).toBe(200);

    const reg = await (await register(req(`/api/staff-attendance/register?month=${month}`))).json();
    const eng = reg.data.members.find((m: any) => m.user.id === ids.engineer);
    expect(eng.cells[yesterday].status).toBe("LEAVE");
    expect(eng.totals.leave).toBe(1);
    const sup = reg.data.members.find((m: any) => m.user.id === ids.supervisor);
    expect(sup.cells[istDateKey()].status).toBe("HALF_DAY");
  });

  it("the work report draft is pre-filled from the day's task updates", async () => {
    as("supervisor");
    const res = await draftReport(req(`/api/work-reports/draft?date=${istDateKey()}`));
    const { data } = await res.json();
    expect(data.activityCount).toBeGreaterThanOrEqual(2);
    expect(data.suggestion.summary).toContain("Slab shuttering 3rd floor: Waiting for plywood sheets (now blocked)");
    expect(data.suggestion.summary).toContain("Waiting for plywood sheets");
    expect(data.suggestion.photoUrls).toContain("/api/uploads/abc123");
    expect(data.suggestion.projectId).toBe(ids.project);
    expect(data.existing).toBeNull();
  });

  it("a filed report goes to the admin, shows in the day overview, and locks once reviewed", async () => {
    as("supervisor");
    const today = istDateKey();
    const filed = await fileReport(
      req("/api/work-reports", "POST", {
        reportDate: today,
        summary: "Shuttering 60% done, waiting on plywood",
        hoursWorked: 8,
        projectId: ids.project,
        blockers: "Plywood short",
        photoUrls: ["/api/uploads/abc123", "javascript:alert(1)"],
      })
    );
    expect(filed.status).toBe(201);
    const report = (await filed.json()).data;
    expect(report.photoUrls).toEqual(["/api/uploads/abc123"]);

    const adminNotes = await prisma.notification.findMany({ where: { organizationId: orgId, userId: ids.admin, type: "WORK_REPORT" } });
    expect(adminNotes).toHaveLength(1);
    expect(adminNotes[0].severity).toBe("WARNING");

    const future = await fileReport(req("/api/work-reports", "POST", { reportDate: "2999-01-01", summary: "Time travel work" }));
    expect(future.status).toBe(422);

    as("supervisor");
    expect((await reviewReport(req(`/api/work-reports/${report.id}`, "PATCH", { status: "REVIEWED" }), { params: { id: report.id } })).status).toBe(403);

    as("admin");
    const day = await (await overview(req(`/api/work-reports/overview?date=${today}`))).json();
    expect(day.data.totals.submitted).toBe(1);
    expect(day.data.totals.withBlockers).toBe(1);
    // The engineer has not filed; the admin is not expected to.
    expect(day.data.totals.expected).toBe(2);
    expect(day.data.totals.missing).toBe(1);

    const reviewed = await reviewReport(
      req(`/api/work-reports/${report.id}`, "PATCH", { status: "REVIEWED", note: "Good photos" }),
      { params: { id: report.id } }
    );
    expect((await reviewed.json()).data.status).toBe("REVIEWED");
    const supNote = await prisma.notification.findFirst({ where: { organizationId: orgId, userId: ids.supervisor, type: "WORK_REPORT" } });
    expect(supNote?.message).toBe("Good photos");

    as("supervisor");
    const locked = await fileReport(req("/api/work-reports", "POST", { reportDate: today, summary: "Changing it after review" }));
    expect(locked.status).toBe(409);
  });

  it("the Command Center shows task updates with photos and who has not filed a report", async () => {
    const overviewData = await CommandCenterService.getOverview(orgId, istDateKey());
    const blocked = overviewData.taskFeed.find((f) => f.status === "BLOCKED");
    expect(blocked?.note).toBe("Waiting for plywood sheets");
    expect(blocked?.photos).toEqual(["/api/uploads/abc123"]);
    expect(overviewData.people.submitted).toBe(1);
    expect(overviewData.people.missing.map((m) => m.name)).toEqual(["Priya Engineer"]);
  });
});
