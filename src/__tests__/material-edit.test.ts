import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH as patchMaterialHandler, GET as getMaterialHandler } from "@/app/api/materials/[id]/route";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { NextRequest } from "next/server";

function makeAuthRequest(
  url: string,
  token: string,
  init?: RequestInit
): NextRequest {
  const headers = new Headers(init?.headers);
  headers.set("Cookie", `${SESSION_COOKIE_NAME}=${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), { ...init, headers });
}

describe("Materials & Stock - Edit Material Option", () => {
  const testOrgId = "test-org-mat-edit-" + Date.now();
  let supervisorUser: any;
  let supervisorToken: string;
  let unauthorizedUser: any;
  let unauthorizedToken: string;
  let testMaterial: any;

  beforeAll(async () => {
    // 1. Create Organization
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Test Org Material Edit",
      },
    });

    // 2. Create User with inventory:adjust (e.g. Supervisor / PM / Admin)
    supervisorUser = await prisma.user.create({
      data: {
        email: `sup-matedit-${Date.now()}@buildtrack.pro`,
        passwordHash: "dummyhash",
        name: "Inventory Manager",
        role: "PROJECT_MANAGER",
        organizationId: testOrgId,
        extraPermissionsJson: JSON.stringify(["inventory:read", "inventory:adjust", "inventory:receipt", "inventory:issue"]),
      },
    });
    supervisorToken = await createSessionToken({
      userId: supervisorUser.id,
      email: supervisorUser.email,
      role: supervisorUser.role,
      organizationId: testOrgId,
      permissions: ["inventory:read", "inventory:adjust", "inventory:receipt", "inventory:issue"],
    });

    // 3. Create User WITHOUT inventory:adjust
    unauthorizedUser = await prisma.user.create({
      data: {
        email: `worker-matedit-${Date.now()}@buildtrack.pro`,
        passwordHash: "dummyhash",
        name: "Site Worker",
        role: "WORKER",
        organizationId: testOrgId,
        extraPermissionsJson: JSON.stringify(["inventory:read"]),
      },
    });
    unauthorizedToken = await createSessionToken({
      userId: unauthorizedUser.id,
      email: unauthorizedUser.email,
      role: unauthorizedUser.role,
      organizationId: testOrgId,
      permissions: ["inventory:read"],
    });

    // 4. Create initial test material
    testMaterial = await prisma.material.create({
      data: {
        organizationId: testOrgId,
        name: "Original 10mm TMT Bar",
        sku: "MAT-TMT-ORIG",
        unitCode: "TON",
        unitPrice: 850.0,
        minStockQty: 20,
        reorderQty: 50,
        active: true,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.materialQuotation.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.material.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.user.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  });

  it("should get existing material details", async () => {
    const req = makeAuthRequest(
      `http://localhost:3000/api/materials/${testMaterial.id}`,
      supervisorToken
    );
    const res = await getMaterialHandler(req, { params: { id: testMaterial.id } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Original 10mm TMT Bar");
    expect(json.data.unitCode).toBe("TON");
    expect(json.data.unitPrice).toBe(850.0);
  });

  it("should edit material name, sku, unitCode, unitPrice, minStockQty, reorderQty", async () => {
    const editPayload = {
      name: "Updated 10mm Fe550D TMT Bar",
      sku: "MAT-TMT-550D",
      unitCode: "TON",
      unitPrice: 920.5,
      minStockQty: 30,
      reorderQty: 80,
      active: true,
    };

    const req = makeAuthRequest(
      `http://localhost:3000/api/materials/${testMaterial.id}`,
      supervisorToken,
      {
        method: "PATCH",
        body: JSON.stringify(editPayload),
      }
    );

    const res = await patchMaterialHandler(req, { params: { id: testMaterial.id } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Updated 10mm Fe550D TMT Bar");
    expect(json.data.sku).toBe("MAT-TMT-550D");
    expect(json.data.unitCode).toBe("TON");
    expect(json.data.unitPrice).toBe(920.5);
    expect(json.data.minStockQty).toBe(30);
    expect(json.data.reorderQty).toBe(80);

    // Verify in database
    const dbMat = await prisma.material.findUnique({
      where: { id: testMaterial.id },
    });
    expect(dbMat?.name).toBe("Updated 10mm Fe550D TMT Bar");
    expect(dbMat?.unitPrice).toBe(920.5);

    // Verify audit event was logged
    const audit = await prisma.auditEvent.findFirst({
      where: {
        organizationId: testOrgId,
        entityId: testMaterial.id,
        action: "MATERIAL_EDITED",
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.action).toBe("MATERIAL_EDITED");
  });

  it("should deny material editing without inventory:adjust permission", async () => {
    const editPayload = {
      name: "Hacked Material Name",
      unitPrice: 1,
    };

    const req = makeAuthRequest(
      `http://localhost:3000/api/materials/${testMaterial.id}`,
      unauthorizedToken,
      {
        method: "PATCH",
        body: JSON.stringify(editPayload),
      }
    );

    const res = await patchMaterialHandler(req, { params: { id: testMaterial.id } });
    expect(res.status).toBe(403);
  });
});
