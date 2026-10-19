import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth";
import { GET as getEmployeesHandler } from "../app/api/chat/employees/route";
import { GET as getConversationsHandler } from "../app/api/chat/conversations/route";
import { POST as createDirectChatHandler } from "../app/api/chat/conversations/direct/route";
import { POST as createGroupChatHandler } from "../app/api/chat/conversations/group/route";
import {
  GET as getMessagesHandler,
  POST as postMessageHandler,
} from "../app/api/chat/conversations/[id]/messages/route";
import { GET as getNotificationsHandler } from "../app/api/notifications/route";
import { GET as getUnreadCountHandler } from "../app/api/chat/unread-count/route";

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

describe("Chat & Employee Messaging Lifecycle Tests", () => {
  let testOrgId: string;
  let superAdminId: string;
  let superAdminToken: string;
  let supervisorId: string;
  let supervisorToken: string;
  let accountantId: string;
  let accountantToken: string;
  let directConversationId: string;
  let groupConversationId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: "Bothra Chat Test Org",
        currency: "INR",
        timezone: "Asia/Kolkata",
        status: "ACTIVE",
      },
    });
    testOrgId = org.id;

    const pwdHash = await hashPassword("TestPass123!");

    // 1. Super Admin
    const superAdmin = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Super Admin Boss",
        email: `boss-${Date.now()}@bothracms.com`,
        passwordHash: pwdHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    });
    superAdminId = superAdmin.id;
    superAdminToken = await createSessionToken({
      userId: superAdmin.id,
      organizationId: testOrgId,
      email: superAdmin.email,
      name: superAdmin.name,
      role: "SUPER_ADMIN",
    });

    // 2. Site Supervisor
    const supervisor = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Ramesh Sharma (Supervisor)",
        email: `ramesh-${Date.now()}@bothracms.com`,
        passwordHash: pwdHash,
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });
    supervisorId = supervisor.id;
    supervisorToken = await createSessionToken({
      userId: supervisor.id,
      organizationId: testOrgId,
      email: supervisor.email,
      name: supervisor.name,
      role: "SITE_SUPERVISOR",
    });

    // 3. Accountant
    const accountant = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Pooja Mehta (Accountant)",
        email: `pooja-${Date.now()}@bothracms.com`,
        passwordHash: pwdHash,
        role: "ACCOUNTANT",
        status: "ACTIVE",
      },
    });
    accountantId = accountant.id;
    accountantToken = await createSessionToken({
      userId: accountant.id,
      organizationId: testOrgId,
      email: accountant.email,
      name: accountant.name,
      role: "ACCOUNTANT",
    });
  });

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({
      where: { conversation: { organizationId: testOrgId } },
    }).catch(() => {});
    await prisma.conversationParticipant.deleteMany({
      where: { conversation: { organizationId: testOrgId } },
    }).catch(() => {});
    await prisma.conversation.deleteMany({
      where: { organizationId: testOrgId },
    }).catch(() => {});
    await prisma.user.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: testOrgId } }).catch(() => {});
  });

  it("should reject unauthenticated access to /api/chat/employees", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/chat/employees", "GET");
    const res = await getEmployeesHandler(req);
    expect(res.status).toBe(401);
  });

  it("should allow Super Admin to list all employees in the organization", async () => {
    const req = makeJsonRequest(
      "http://localhost:3000/api/chat/employees",
      "GET",
      undefined,
      superAdminToken
    );
    const res = await getEmployeesHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.employees.length).toBeGreaterThanOrEqual(3);
    expect(json.data.currentUser.isSuperAdmin).toBe(true);
  });

  it("should create a 1-to-1 direct conversation between Super Admin and an employee without making a group", async () => {
    const req = makeJsonRequest(
      "http://localhost:3000/api/chat/conversations/direct",
      "POST",
      { targetUserId: supervisorId },
      superAdminToken
    );
    const res = await createDirectChatHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.conversation).toBeDefined();
    expect(json.data.conversation.type).toBe("DIRECT"); // Crucial: NOT a group!
    expect(json.data.conversation.participants.length).toBe(2);

    directConversationId = json.data.conversation.id;

    // Verify calling again returns the existing direct conversation without creating duplicate or group
    const repeatReq = makeJsonRequest(
      "http://localhost:3000/api/chat/conversations/direct",
      "POST",
      { targetUserId: supervisorId },
      superAdminToken
    );
    const repeatRes = await createDirectChatHandler(repeatReq);
    const repeatJson = await repeatRes.json();
    expect(repeatJson.success).toBe(true);
    expect(repeatJson.data.conversation.id).toBe(directConversationId);
    expect(repeatJson.data.isNew).toBe(false);
  });

  it("should forbid non-Super Admin from creating chat groups (enforcing user rule)", async () => {
    // Normal supervisor attempts to create a group
    const req = makeJsonRequest(
      "http://localhost:3000/api/chat/conversations/group",
      "POST",
      {
        name: "Unauthorized Workers Group",
        memberIds: [accountantId],
      },
      supervisorToken
    );
    const res = await createGroupChatHandler(req);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.message).toContain("Only Super Admin");
  });

  it("should allow Super Admin to create a custom group chat with chosen employees", async () => {
    const req = makeJsonRequest(
      "http://localhost:3000/api/chat/conversations/group",
      "POST",
      {
        name: "Core Project Leads & Finance",
        description: "Coordination channel for Skyline Heights phase 2",
        memberIds: [supervisorId, accountantId],
      },
      superAdminToken
    );
    const res = await createGroupChatHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.group).toBeDefined();
    expect(json.data.group.type).toBe("GROUP");
    expect(json.data.group.name).toBe("Core Project Leads & Finance");
    expect(json.data.group.participants.length).toBe(3); // Super Admin + Supervisor + Accountant

    groupConversationId = json.data.group.id;
  });

  it("should allow participants to send and retrieve messages in a conversation", async () => {
    // Super admin sends message in direct chat
    const sendReq = makeJsonRequest(
      `http://localhost:3000/api/chat/conversations/${directConversationId}/messages`,
      "POST",
      { content: "Hello Ramesh, please update today's brick receipt status." },
      superAdminToken
    );
    const sendRes = await postMessageHandler(sendReq, { params: { id: directConversationId } });
    expect(sendRes.status).toBe(200);

    const sendJson = await sendRes.json();
    expect(sendJson.success).toBe(true);
    expect(sendJson.data.message.content).toBe("Hello Ramesh, please update today's brick receipt status.");

    // Supervisor replies
    const replyReq = makeJsonRequest(
      `http://localhost:3000/api/chat/conversations/${directConversationId}/messages`,
      "POST",
      { content: "Sir, 4425 bricks arrived and unloaded at Main Yard store." },
      supervisorToken
    );
    const replyRes = await postMessageHandler(replyReq, { params: { id: directConversationId } });
    expect(replyRes.status).toBe(200);

    // Fetch messages
    const getReq = makeJsonRequest(
      `http://localhost:3000/api/chat/conversations/${directConversationId}/messages`,
      "GET",
      undefined,
      superAdminToken
    );
    const getRes = await getMessagesHandler(getReq, { params: { id: directConversationId } });
    expect(getRes.status).toBe(200);

    const getJson = await getRes.json();
    expect(getJson.success).toBe(true);
    expect(getJson.data.messages.length).toBe(2);
    expect(getJson.data.messages[1].content).toContain("unloaded at Main Yard");
  });

  it("should reject non-participant from reading or posting to another conversation", async () => {
    // Accountant is NOT in the direct conversation between Super Admin and Supervisor
    const getReq = makeJsonRequest(
      `http://localhost:3000/api/chat/conversations/${directConversationId}/messages`,
      "GET",
      undefined,
      accountantToken
    );
    const getRes = await getMessagesHandler(getReq, { params: { id: directConversationId } });
    expect(getRes.status).toBe(403);
  });

  it("should trigger receiver operational notification and unread count on message sent", async () => {
    // Super Admin posts a message in the group conversation (which includes Accountant)
    const postReq = makeJsonRequest(
      `http://localhost:3000/api/chat/conversations/${groupConversationId}/messages`,
      "POST",
      { content: "Urgent: Please confirm payment voucher for vendor cement delivery." },
      superAdminToken
    );
    const postRes = await postMessageHandler(postReq, { params: { id: groupConversationId } });
    expect(postRes.status).toBe(200);

    // Accountant (receiver) checks notifications
    const notifReq = makeJsonRequest(
      "http://localhost:3000/api/notifications",
      "GET",
      undefined,
      accountantToken
    );
    const notifRes = await getNotificationsHandler(notifReq);
    expect(notifRes.status).toBe(200);

    const notifJson = await notifRes.json();
    expect(notifJson.success).toBe(true);
    expect(notifJson.data.unreadChatCount).toBeGreaterThanOrEqual(1);

    // Verify chat alert exists in alerts list
    const chatAlert = notifJson.data.alerts.find((a: any) => a.type === "CHAT_MESSAGE");
    expect(chatAlert).toBeDefined();
    expect(chatAlert.title).toContain("Super Admin Boss");
    expect(chatAlert.message).toContain("cement delivery");
    expect(chatAlert.href).toBe("/chat");

    // Accountant checks unread count endpoint (used by menu option)
    const countReq = makeJsonRequest(
      "http://localhost:3000/api/chat/unread-count",
      "GET",
      undefined,
      accountantToken
    );
    const countRes = await getUnreadCountHandler(countReq);
    expect(countRes.status).toBe(200);

    const countJson = await countRes.json();
    expect(countJson.success).toBe(true);
    expect(countJson.data.unreadCount).toBeGreaterThanOrEqual(1);
    expect(countJson.data.latestMessage).toBeDefined();
    expect(countJson.data.latestMessage.senderName).toBe("Super Admin Boss");

    // When Accountant opens the conversation to read messages
    const readReq = makeJsonRequest(
      `http://localhost:3000/api/chat/conversations/${groupConversationId}/messages`,
      "GET",
      undefined,
      accountantToken
    );
    const readRes = await getMessagesHandler(readReq, { params: { id: groupConversationId } });
    expect(readRes.status).toBe(200);

    // Unread count should now be 0
    const countAfterReq = makeJsonRequest(
      "http://localhost:3000/api/chat/unread-count",
      "GET",
      undefined,
      accountantToken
    );
    const countAfterRes = await getUnreadCountHandler(countAfterReq);
    const countAfterJson = await countAfterRes.json();
    expect(countAfterJson.success).toBe(true);
    expect(countAfterJson.data.unreadCount).toBe(0);
  });

  it("should allow sharing images with or without captions in chat messages", async () => {
    // 1. Post message with both photo and caption
    const postImageWithTextReq = makeJsonRequest(
      `http://localhost:3000/api/chat/conversations/${directConversationId}/messages`,
      "POST",
      {
        content: "Site inspection beam crack photo",
        imageUrl: "/api/uploads/test-inspection-photo-123.jpg",
      },
      superAdminToken
    );
    const postRes1 = await postMessageHandler(postImageWithTextReq, { params: { id: directConversationId } });
    expect(postRes1.status).toBe(200);
    const json1 = await postRes1.json();
    expect(json1.success).toBe(true);
    expect(json1.data.message.content).toBe("Site inspection beam crack photo");
    expect(json1.data.message.imageUrl).toBe("/api/uploads/test-inspection-photo-123.jpg");

    // 2. Post message with photo only (no caption text)
    const postImageOnlyReq = makeJsonRequest(
      `http://localhost:3000/api/chat/conversations/${directConversationId}/messages`,
      "POST",
      {
        content: "",
        imageUrl: "/api/uploads/test-concrete-pour-456.jpg",
      },
      supervisorToken
    );
    const postRes2 = await postMessageHandler(postImageOnlyReq, { params: { id: directConversationId } });
    expect(postRes2.status).toBe(200);
    const json2 = await postRes2.json();
    expect(json2.success).toBe(true);
    expect(json2.data.message.content).toBe("[Photo]");
    expect(json2.data.message.imageUrl).toBe("/api/uploads/test-concrete-pour-456.jpg");

    // 3. Fetch conversation messages and verify image presence
    const getMsgsReq = makeJsonRequest(
      `http://localhost:3000/api/chat/conversations/${directConversationId}/messages`,
      "GET",
      undefined,
      superAdminToken
    );
    const getMsgsRes = await getMessagesHandler(getMsgsReq, { params: { id: directConversationId } });
    expect(getMsgsRes.status).toBe(200);
    const getMsgsJson = await getMsgsRes.json();
    expect(getMsgsJson.success).toBe(true);

    const msgs = getMsgsJson.data.messages;
    const photoOnlyMsg = msgs.find((m: any) => m.imageUrl === "/api/uploads/test-concrete-pour-456.jpg");
    expect(photoOnlyMsg).toBeDefined();
    expect(photoOnlyMsg.imageUrl).toBe("/api/uploads/test-concrete-pour-456.jpg");

    // 4. Verify conversation list shows photo indicator for latestMessage
    const convsReq = makeJsonRequest(
      "http://localhost:3000/api/chat/conversations",
      "GET",
      undefined,
      superAdminToken
    );
    const convsRes = await getConversationsHandler(convsReq);
    expect(convsRes.status).toBe(200);
    const convsJson = await convsRes.json();
    const convItem = convsJson.data.conversations.find((c: any) => c.id === directConversationId);
    expect(convItem).toBeDefined();
    expect(convItem.latestMessage.content).toBe("📷 Photo");
    expect(convItem.latestMessage.imageUrl).toBe("/api/uploads/test-concrete-pour-456.jpg");
  });
});
