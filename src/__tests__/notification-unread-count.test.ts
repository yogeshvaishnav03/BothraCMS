import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth";
import { GET as getNotificationsHandler, PATCH as patchNotificationsHandler } from "../app/api/notifications/route";

function makeJsonRequest(url: string, method: string, body?: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Operational Alerts & Notification Unread Count Verification", () => {
  let testOrgId: string;
  let testUserId: string;
  let userToken: string;
  let testSiteId: string;
  let testProjectId: string;
  let notifId: string;
  let anomalySessionId: string;

  beforeAll(async () => {
    // 1. Create Organization
    const org = await prisma.organization.create({
      data: {
        name: "Alerts Test Org " + Date.now(),
        status: "ACTIVE",
      },
    });
    testOrgId = org.id;

    // 2. Create User
    const passwordHash = await hashPassword("ValidPassword123!");
    const user = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        email: `alertstest_${Date.now()}@example.com`,
        passwordHash,
        name: "Alert Tester",
        role: "SUPER_ADMIN",
      },
    });
    testUserId = user.id;
    userToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    // 3. Create Site & Project & Workforce member
    const site = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Alert Test Site",
        code: "SITE-ALT-" + Date.now().toString().slice(-4),
        address: "Alert Site Address",
        status: "ACTIVE",
      },
    });
    testSiteId = site.id;

    const project = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: testSiteId,
        name: "Alert Test Project",
        code: "PRJ-ALT-" + Date.now().toString().slice(-4),
        status: "ACTIVE",
      },
    });
    testProjectId = project.id;

    const worker = await prisma.workforceMember.create({
      data: {
        organizationId: testOrgId,
        employeeCode: "EMP-ALT-" + Date.now().toString().slice(-4),
        name: "Dinesh Yadav",
        workerType: "MASON",
        active: true,
      },
    });

    // 4. Create an unclosed past shift (Attendance Anomaly)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const session = await prisma.attendanceSession.create({
      data: {
        organization: { connect: { id: testOrgId } },
        site: { connect: { id: testSiteId } },
        project: { connect: { id: testProjectId } },
        workforceMember: { connect: { id: worker.id } },
        creator: { connect: { id: testUserId } },
        workDate: yesterdayStr,
        checkInAt: yesterday,
        checkOutAt: null,
        status: "PRESENT",
      },
    });
    anomalySessionId = session.id;

    // 5. Create a Task Reminder notification
    const notif = await prisma.notification.create({
      data: {
        organizationId: testOrgId,
        userId: testUserId,
        type: "TASK_REMINDER",
        title: "Task Reminder: Account Reports for this quarter",
        message: "Quarterly accounts due today",
        severity: "WARNING",
        readAt: null,
      },
    });
    notifId = notif.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.notification.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.attendanceSession.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.workforceMember.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.project.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.site.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.user.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.organization.deleteMany({ where: { id: testOrgId } });
  });

  it("returns unread count reflecting both notifications and operational alerts", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, userToken);
    const res = await getNotificationsHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.unreadCount).toBeGreaterThanOrEqual(2);

    const taskAlert = data.data.alerts.find((a: any) => a.id === `notif-${notifId}`);
    expect(taskAlert).toBeDefined();
    expect(taskAlert.isRead).toBe(false);

    const anomalyAlert = data.data.alerts.find((a: any) => a.id === `att-anomaly-${anomalySessionId}`);
    expect(anomalyAlert).toBeDefined();
    expect(anomalyAlert.isRead).toBe(false);
  });

  it("reduces unread count when a derived operational alert is marked as read", async () => {
    // 1. Initial count
    const initialReq = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, userToken);
    const initialRes = await getNotificationsHandler(initialReq);
    const initialData = await initialRes.json();
    const initialCount = initialData.data.unreadCount;

    // 2. Mark attendance anomaly as read
    const patchReq = makeJsonRequest(
      "http://localhost:3000/api/notifications",
      "PATCH",
      { notificationId: `att-anomaly-${anomalySessionId}` },
      userToken
    );
    const patchRes = await patchNotificationsHandler(patchReq);
    const patchData = await patchRes.json();

    expect(patchRes.status).toBe(200);
    expect(patchData.success).toBe(true);

    // 3. Verify subsequent GET reflects decremented count and isRead: true
    const subsequentReq = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, userToken);
    const subsequentRes = await getNotificationsHandler(subsequentReq);
    const subsequentData = await subsequentRes.json();

    expect(subsequentData.data.unreadCount).toBe(initialCount - 1);
    const anomalyAlert = subsequentData.data.alerts.find((a: any) => a.id === `att-anomaly-${anomalySessionId}`);
    expect(anomalyAlert.isRead).toBe(true);
  });

  it("reduces unread count when a direct notification is marked as read", async () => {
    // 1. Initial count
    const initialReq = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, userToken);
    const initialRes = await getNotificationsHandler(initialReq);
    const initialData = await initialRes.json();
    const initialCount = initialData.data.unreadCount;

    // 2. Mark task reminder as read
    const patchReq = makeJsonRequest(
      "http://localhost:3000/api/notifications",
      "PATCH",
      { notificationId: `notif-${notifId}` },
      userToken
    );
    const patchRes = await patchNotificationsHandler(patchReq);
    const patchData = await patchRes.json();

    expect(patchRes.status).toBe(200);
    expect(patchData.success).toBe(true);

    // 3. Verify subsequent GET reflects decremented count and isRead: true
    const subsequentReq = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, userToken);
    const subsequentRes = await getNotificationsHandler(subsequentReq);
    const subsequentData = await subsequentRes.json();

    expect(subsequentData.data.unreadCount).toBe(initialCount - 1);
    const taskAlert = subsequentData.data.alerts.find((a: any) => a.id === `notif-${notifId}`);
    expect(taskAlert.isRead).toBe(true);
  });

  it("reduces unread count to 0 and persists when 'Mark all read' is clicked", async () => {
    // Fetch current alerts
    const getReq = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, userToken);
    const getRes = await getNotificationsHandler(getReq);
    const getData = await getRes.json();
    const alertIds = getData.data.alerts.map((a: any) => a.id);

    // Send mark all read
    const patchReq = makeJsonRequest(
      "http://localhost:3000/api/notifications",
      "PATCH",
      { all: true, alertIds },
      userToken
    );
    const patchRes = await patchNotificationsHandler(patchReq);
    const patchData = await patchRes.json();

    expect(patchRes.status).toBe(200);
    expect(patchData.success).toBe(true);

    // Verify unread count is now 0 and remains 0 on re-fetch
    const recheckReq = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, userToken);
    const recheckRes = await getNotificationsHandler(recheckReq);
    const recheckData = await recheckRes.json();

    expect(recheckData.data.unreadCount).toBe(0);
    for (const alert of recheckData.data.alerts) {
      expect(alert.isRead).toBe(true);
    }
  });
});
