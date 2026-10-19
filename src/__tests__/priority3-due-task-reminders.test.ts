import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { ReminderService } from "@/services/reminder-service";

describe("Priority 3: Automatic Delivery of Due Task Reminders", () => {
  const orgId = "org-test-p3";
  const userCreatorId = "user-creator-p3";
  const userAssigneeId = "user-assignee-p3";
  let projectId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.project.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    // Seed org and users
    await prisma.organization.create({
      data: { id: orgId, name: "Priority 3 Org", status: "ACTIVE" },
    });

    await prisma.user.createMany({
      data: [
        { id: userCreatorId, organizationId: orgId, name: "Site Manager", email: "sm@p3.test", role: "PROJECT_MANAGER", passwordHash: "test-hash" },
        { id: userAssigneeId, organizationId: orgId, name: "Supervisor", email: "sup@p3.test", role: "SUPERVISOR", passwordHash: "test-hash" },
      ],
    });

    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "Tower Site",
        code: "TS-01",
        address: "456 Skyline Blvd",
        status: "ACTIVE",
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        name: "Project Tower A",
        code: "PTA-01",
        status: "IN_PROGRESS",
      },
    });
    projectId = project.id;
  });

  it("3.1 Delivers reminder when reminderAt <= now and reminderDeliveredAt is null", async () => {
    const pastReminder = new Date(Date.now() - 1000 * 60 * 30); // 30 mins ago

    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId,
        title: "Inspect Column Shuttering",
        assigneeUserId: userAssigneeId,
        createdBy: userCreatorId,
        status: "IN_PROGRESS",
        priority: "HIGH",
        reminderAt: pastReminder,
        reminderDeliveredAt: null,
      },
    });

    const result = await ReminderService.deliverDueReminders(orgId);
    expect(result).toBe(1);

    // Verify Notification record was created for the assignee
    const notification = await prisma.notification.findFirst({
      where: {
        organizationId: orgId,
        userId: userAssigneeId,
        entityId: task.id,
      },
    });

    expect(notification).toBeDefined();
    expect(notification!.type).toBe("TASK_REMINDER");
    expect(notification!.title).toContain("Task Reminder");
    expect(notification!.message).toContain("Inspect Column Shuttering");
    expect(notification!.readAt).toBeNull();

    // Verify task.reminderDeliveredAt was stamped
    const updatedTask = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updatedTask!.reminderDeliveredAt).not.toBeNull();
  });

  it("3.2 Reminder delivery is strictly idempotent and does not produce duplicate notifications", async () => {
    const pastReminder = new Date(Date.now() - 1000 * 60 * 60);

    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId,
        title: "Electrical Conduit Inspection",
        assigneeUserId: userAssigneeId,
        createdBy: userCreatorId,
        status: "PENDING",
        reminderAt: pastReminder,
      },
    });

    // First delivery
    const firstRun = await ReminderService.deliverDueReminders(orgId);
    expect(firstRun).toBe(1);

    // Second delivery run immediately after
    const secondRun = await ReminderService.deliverDueReminders(orgId);
    expect(secondRun).toBe(0);

    // Verify notifications were delivered to both assignee and creator (1 each)
    const notifications = await prisma.notification.findMany({
      where: { entityId: task.id },
    });
    expect(notifications.length).toBe(2);
    expect(notifications.some((n) => n.userId === userAssigneeId)).toBe(true);
    expect(notifications.some((n) => n.userId === userCreatorId)).toBe(true);
  });

  it("3.3 Does NOT deliver reminders scheduled for the future", async () => {
    const futureReminder = new Date(Date.now() + 1000 * 60 * 60 * 24); // Tomorrow

    await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId,
        title: "Future Slab Pouring",
        assigneeUserId: userAssigneeId,
        createdBy: userCreatorId,
        status: "PENDING",
        reminderAt: futureReminder,
      },
    });

    const result = await ReminderService.deliverDueReminders(orgId);
    expect(result).toBe(0);

    const notifications = await prisma.notification.findMany({
      where: { organizationId: orgId },
    });
    expect(notifications.length).toBe(0);
  });

  it("3.4 Does NOT deliver reminders for tasks that are already completed", async () => {
    const pastReminder = new Date(Date.now() - 1000 * 60 * 30);

    await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId,
        title: "Completed Boundary Wall",
        assigneeUserId: userAssigneeId,
        createdBy: userCreatorId,
        status: "COMPLETED",
        reminderAt: pastReminder,
      },
    });

    const result = await ReminderService.deliverDueReminders(orgId);
    expect(result).toBe(0);
  });
});
