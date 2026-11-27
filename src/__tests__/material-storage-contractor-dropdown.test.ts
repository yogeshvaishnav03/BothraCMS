import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { GET as getStorageHandler, POST as postStorageHandler } from "@/app/api/material-storage/route";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

describe("Material Storage - Contractor Dropdown & Issue Verification", () => {
  const testOrgId = `org-mat-storage-${Date.now()}`;
  let supervisorUser: any;
  let supervisorToken: string;
  let contractorParty: any;
  let site: any;
  let project: any;
  let store: any;
  let material: any;

  beforeAll(async () => {
    // 1. Organization
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Material Storage Contractor Dropdown Test Org",
      },
    });

    // 2. Supervisor User
    supervisorUser = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Ranjan Sharma",
        email: `supervisor-${Date.now()}@bothracms.com`,
        passwordHash: "hash123",
        role: "SITE_SUPERVISOR",
      },
    });

    supervisorToken = await createSessionToken({
      userId: supervisorUser.id,
      email: supervisorUser.email,
      role: supervisorUser.role,
      organizationId: testOrgId,
    });

    // 3. Contractor Party
    contractorParty = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Ramesh Kumar Shuttering Contractors",
        partyType: "CONTRACTOR",
        phone: "9829012345",
      },
    });

    // 4. Site & Project
    site = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        code: `SITE-${Date.now().toString().slice(-4)}`,
        name: "Chaupasni Site",
        address: "Chaupasni Road, Jodhpur",
      },
    });

    project = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: site.id,
        name: "Chaupasni - General Operations",
        code: "CH-GEN",
        status: "ACTIVE",
        managerUserId: supervisorUser.id,
      },
    });

    // 5. Store / Warehouse
    store = await prisma.store.create({
      data: {
        organizationId: testOrgId,
        siteId: site.id,
        name: "Chaupasni Main Site Store",
      },
    });

    // 6. Material with initial stock
    material = await prisma.material.create({
      data: {
        organizationId: testOrgId,
        name: "Reinforcement Steel Bars 12mm",
        sku: `SKU-STEEL-${Date.now().toString().slice(-4)}`,
        unitCode: "TON",
        unitPrice: 65000,
      },
    });

    // Add initial inward movement
    await prisma.stockMovement.create({
      data: {
        organizationId: testOrgId,
        materialId: material.id,
        storeId: store.id,
        movementType: "RECEIPT",
        quantityDelta: 100,
        unitCode: "TON",
        createdBy: supervisorUser.id,
        notes: "Initial inventory",
      },
    });

    await prisma.stockBalance.create({
      data: {
        materialId: material.id,
        storeId: store.id,
        quantityOnHand: 100,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.stockMovement.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.stockBalance.deleteMany({ where: { store: { organizationId: testOrgId } } });
      await prisma.material.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.store.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.party.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.project.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.site.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.user.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  });

  const makeAuthRequest = (url: string, token: string, init?: RequestInit) => {
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        ...(init?.headers || {}),
      },
    });
  };

  it("should issue material to a selected contractor", async () => {
    const issuePayload = {
      materialId: material.id,
      storeId: store.id,
      projectId: project.id,
      quantity: 15,
      issuedToName: contractorParty.name,
      notes: "Issued for 2nd floor columns",
      movementAt: new Date().toISOString(),
    };

    const req = makeAuthRequest("http://localhost:3000/api/material-storage", supervisorToken, {
      method: "POST",
      body: JSON.stringify(issuePayload),
    });

    const res = await postStorageHandler(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.movement).toBeDefined();
    expect(Math.abs(Number(json.data.movement.quantityDelta))).toBe(15);

    const updatedMovement = await prisma.stockMovement.findUnique({
      where: { id: json.data.movement.id },
    });
    expect(updatedMovement?.issuedToName).toBe("Ramesh Kumar Shuttering Contractors");
  });

  it("should list storage movements showing the selected contractor as responsible person", async () => {
    const req = makeAuthRequest("http://localhost:3000/api/material-storage", supervisorToken);
    const res = await getStorageHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);

    const movement = json.data.find((m: any) => m.materialId === material.id && m.movementType === "ISSUE");
    expect(movement).toBeDefined();
    expect(movement.responsiblePerson).toBe("Ramesh Kumar Shuttering Contractors");
    expect(movement.issuedMaterial).toBe(15);
    expect(movement.remainingMaterial).toBe(85);
  });
});
