import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { GET as getUploadHandler } from "@/app/api/uploads/[id]/route";

function makeJsonRequest(url: string, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "GET",
    headers,
  });
}

describe("Uploads Security, Tenant Isolation & Chat Image Access Tests (Task 1)", () => {
  const ts = Date.now();
  const orgAId = `test-org-up-a-${ts}`;
  const orgBId = `test-org-up-b-${ts}`;

  let userAId: string;
  let userBId: string; // Same org as userA, but not in private conversation
  let userForeignId: string; // Different org (orgB)
  let userAToken: string;
  let userBToken: string;
  let userForeignToken: string;

  let generalAttachmentId: string;
  let financialAttachmentId: string;
  let conversationId: string;
  let chatMessageId: string;
  const chatFileId = `chat-photo-${ts}.jpg`;

  beforeAll(async () => {
    // 1. Create Organizations
    await prisma.organization.create({
      data: { id: orgAId, name: "Uploads Test Org A", currency: "INR", timezone: "Asia/Kolkata" },
    });
    await prisma.organization.create({
      data: { id: orgBId, name: "Uploads Test Org B", currency: "INR", timezone: "Asia/Kolkata" },
    });

    // 2. Create Users
    userAId = `user-a-${ts}`;
    await prisma.user.create({
      data: {
        id: userAId,
        organizationId: orgAId,
        name: "User A (Participant)",
        email: `usera-${ts}@test.com`,
        passwordHash: "hash",
        role: "SITE_SUPERVISOR",
      },
    });
    userAToken = await createSessionToken({
      userId: userAId,
      organizationId: orgAId,
      name: "User A",
      email: `usera-${ts}@test.com`,
      role: "SITE_SUPERVISOR",
    });

    userBId = `user-b-${ts}`;
    await prisma.user.create({
      data: {
        id: userBId,
        organizationId: orgAId,
        name: "User B (Non-Participant)",
        email: `userb-${ts}@test.com`,
        passwordHash: "hash",
        role: "SITE_SUPERVISOR",
      },
    });
    userBToken = await createSessionToken({
      userId: userBId,
      organizationId: orgAId,
      name: "User B",
      email: `userb-${ts}@test.com`,
      role: "SITE_SUPERVISOR",
    });

    userForeignId = `user-foreign-${ts}`;
    await prisma.user.create({
      data: {
        id: userForeignId,
        organizationId: orgBId,
        name: "Foreign User (Org B)",
        email: `userfor-${ts}@test.com`,
        passwordHash: "hash",
        role: "ORG_ADMIN",
      },
    });
    userForeignToken = await createSessionToken({
      userId: userForeignId,
      organizationId: orgBId,
      name: "Foreign User",
      email: `userfor-${ts}@test.com`,
      role: "ORG_ADMIN",
    });

    // 3. Create General Attachment in Org A
    const genAtt = await prisma.attachment.create({
      data: {
        organizationId: orgAId,
        fileName: "site-drawing.png",
        diskFileName: `drawing-${ts}.png`,
        fileId: `file-gen-${ts}`,
        mimeType: "image/png",
        category: "GENERAL",
        entityType: "SITE",
        entityId: `site-entity-${ts}`,
        uploadedById: userAId,
        fileSize: 1024,
      },
    });
    generalAttachmentId = genAtt.id;

    // 4. Create Financial Attachment in Org A
    const finAtt = await prisma.attachment.create({
      data: {
        organizationId: orgAId,
        fileName: "invoice-vendor.pdf",
        diskFileName: `invoice-${ts}.pdf`,
        fileId: `file-fin-${ts}`,
        mimeType: "application/pdf",
        category: "INVOICE",
        entityType: "BILL",
        entityId: `bill-entity-${ts}`,
        uploadedById: userAId,
        fileSize: 2048,
      },
    });
    financialAttachmentId = finAtt.id;

    // 5. Create Private Conversation in Org A with ONLY userA
    const conv = await prisma.conversation.create({
      data: {
        organizationId: orgAId,
        createdById: userAId,
        type: "DIRECT",
        participants: {
          create: [{ userId: userAId }],
        },
      },
    });
    conversationId = conv.id;

    // 6. Create Chat Message with photo in Conversation
    const msg = await prisma.chatMessage.create({
      data: {
        conversationId: conversationId,
        senderId: userAId,
        content: "Inspection photo attached",
        imageUrl: `/api/uploads/${chatFileId}`,
      },
    });
    chatMessageId = msg.id;

    // Store dummy payload in IdempotencyRecord for the chat photo
    await prisma.idempotencyRecord.create({
      data: {
        organizationId: orgAId,
        key: `FILE_BLOB_${chatFileId}`,
        operation: "FILE_BLOB",
        responseCode: 200,
        responseBodyJson: Buffer.from("dummy-chat-image-content-bytes").toString("base64"),
      },
    });
  });

  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { key: { contains: `${ts}` } } }).catch(() => {});
    await prisma.chatMessage.deleteMany({ where: { conversationId } }).catch(() => {});
    await prisma.conversationParticipant.deleteMany({ where: { conversationId } }).catch(() => {});
    await prisma.conversation.deleteMany({ where: { id: conversationId } }).catch(() => {});
    await prisma.attachment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } }).catch(() => {});
  });

  it("1. Allows authorized tenant member to access general attachment", async () => {
    const req = makeJsonRequest(`http://localhost:3000/api/uploads/${generalAttachmentId}`, userAToken);
    const res = await getUploadHandler(req, { params: { id: generalAttachmentId } });
    expect(res.status).toBe(200);
  });

  it("2. Blocks cross-tenant user from accessing Org A attachment (Returns 404 NOT_FOUND)", async () => {
    const req = makeJsonRequest(`http://localhost:3000/api/uploads/${generalAttachmentId}`, userForeignToken);
    const res = await getUploadHandler(req, { params: { id: generalAttachmentId } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("3. Denies financial attachment download to non-finance role (SITE_SUPERVISOR)", async () => {
    const req = makeJsonRequest(`http://localhost:3000/api/uploads/${financialAttachmentId}`, userAToken);
    const res = await getUploadHandler(req, { params: { id: financialAttachmentId } });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("4. Allows chat conversation participant to download chat image", async () => {
    const req = makeJsonRequest(`http://localhost:3000/api/uploads/${chatFileId}`, userAToken);
    const res = await getUploadHandler(req, { params: { id: chatFileId } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("5. Blocks non-participant in the same organization from accessing private chat image", async () => {
    const req = makeJsonRequest(`http://localhost:3000/api/uploads/${chatFileId}`, userBToken);
    const res = await getUploadHandler(req, { params: { id: chatFileId } });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
    expect(json.error.message).toContain("not a participant");
  });

  it("6. Blocks cross-tenant user from accessing private chat image", async () => {
    const req = makeJsonRequest(`http://localhost:3000/api/uploads/${chatFileId}`, userForeignToken);
    const res = await getUploadHandler(req, { params: { id: chatFileId } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("7. Returns 404 Not Found for non-existent image ID instead of returning 200 SVG", async () => {
    const fakeId = `non-existent-${ts}.jpg`;
    const req = makeJsonRequest(`http://localhost:3000/api/uploads/${fakeId}`, userAToken);
    const res = await getUploadHandler(req, { params: { id: fakeId } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("8. Rejects malformed and path traversal file identifiers", async () => {
    const traversalId = `../../etc/passwd`;
    const req = makeJsonRequest(`http://localhost:3000/api/uploads/${encodeURIComponent(traversalId)}`, userAToken);
    const res = await getUploadHandler(req, { params: { id: traversalId } });
    expect(res.status).toBe(404);
  });
});
