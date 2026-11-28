import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { MaterialRequestService } from "@/services/material-request-service";
import { InventoryService } from "@/services/inventory-service";
import { UserContext } from "@/lib/server-auth";

describe("Material Requests Stock Transfer vs Order Flow", () => {
  const testOrgId = `org-mr-transfer-${Date.now()}`;
  let adminUser: any;
  let userCtx: UserContext;
  let siteA: any;
  let siteB: any;
  let storeA: any;
  let storeB: any;
  let projectB: any;
  let materialInStock: any;
  let materialOutOfStock: any;
  let requestInStock: any;
  let requestOutOfStock: any;

  beforeAll(async () => {
    // 1. Organization
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Stock Transfer Test Org",
      },
    });

    // 2. Admin User
    adminUser = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Test Super Admin",
        email: `admin-${Date.now()}@testtransfer.com`,
        passwordHash: "hash",
        role: "SUPER_ADMIN",
      },
    });

    userCtx = {
      userId: adminUser.id,
      organizationId: testOrgId,
      role: "SUPER_ADMIN",
      email: adminUser.email,
      name: adminUser.name,
      permissions: ["*"],
    };

    // 3. Sites & Stores
    siteA = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Central Supply Yard",
        code: `CY-${Date.now().toString().slice(-4)}`,
        address: "Central Supply Yard Road",
      },
    });

    siteB = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Peva Nagar Worksite",
        code: `PN-${Date.now().toString().slice(-4)}`,
        address: "Peva Nagar Main Road",
      },
    });

    storeA = await prisma.store.create({
      data: {
        organizationId: testOrgId,
        siteId: siteA.id,
        name: "Central Yard Main Store",
        status: "ACTIVE",
      },
    });

    storeB = await prisma.store.create({
      data: {
        organizationId: testOrgId,
        siteId: siteB.id,
        name: "Peva Nagar Site Store",
        status: "ACTIVE",
      },
    });

    projectB = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        name: "Peva Nagar Commercial Project",
        code: `PRJ-${Date.now().toString().slice(-4)}`,
        siteId: siteB.id,
      },
    });

    // 4. Materials
    materialInStock = await prisma.material.create({
      data: {
        organizationId: testOrgId,
        name: "BAJARI 10MM",
        sku: `BAJ-${Date.now().toString().slice(-4)}`,
        unitCode: "TON",
        unitPrice: 80000,
      },
    });

    materialOutOfStock = await prisma.material.create({
      data: {
        organizationId: testOrgId,
        name: "RED CLAY BRICKS",
        sku: `BRK-${Date.now().toString().slice(-4)}`,
        unitCode: "NOS",
        unitPrice: 1200,
      },
    });

    // Seed stock balance: Store A has 50 TON of BAJARI, Store B has 0 TON
    await prisma.stockBalance.create({
      data: {
        materialId: materialInStock.id,
        storeId: storeA.id,
        quantityOnHand: 50,
      },
    });

    await prisma.stockBalance.create({
      data: {
        materialId: materialInStock.id,
        storeId: storeB.id,
        quantityOnHand: 0,
      },
    });

    // 5. Material Requests for Project B (at Site B)
    requestInStock = await prisma.materialRequest.create({
      data: {
        organizationId: testOrgId,
        requestNumber: `MR-TRANS-${Date.now().toString().slice(-5)}-1`,
        projectId: projectB.id,
        requestedById: adminUser.id,
        status: "APPROVED",
        items: {
          create: [
            {
              materialId: materialInStock.id,
              description: "BAJARI 10MM",
              quantity: 45,
              approvedQty: 45,
              unitCode: "TON",
            },
          ],
        },
      },
    });

    requestOutOfStock = await prisma.materialRequest.create({
      data: {
        organizationId: testOrgId,
        requestNumber: `MR-TRANS-${Date.now().toString().slice(-5)}-2`,
        projectId: projectB.id,
        requestedById: adminUser.id,
        status: "APPROVED",
        items: {
          create: [
            {
              materialId: materialOutOfStock.id,
              description: "RED CLAY BRICKS",
              quantity: 1000,
              approvedQty: 1000,
              unitCode: "NOS",
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.stockMovement.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.stockBalance.deleteMany({ where: { material: { organizationId: testOrgId } } });
      await prisma.materialRequestItem.deleteMany({ where: { request: { organizationId: testOrgId } } });
      await prisma.materialRequest.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.project.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.store.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.site.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.material.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.user.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } catch {}
  });

  it("identifies items available in Material & Stock with auto-resolved source and target stores", async () => {
    const list = await MaterialRequestService.list(userCtx, {});

    const req1 = list.find((r) => r.id === requestInStock.id);
    expect(req1).toBeDefined();
    expect(req1!.items).toHaveLength(1);

    const item1 = req1!.items[0];
    expect(item1.isAvailableInStock).toBe(true);
    expect(item1.totalStock).toBe(50);
    expect(item1.stockAtSite).toBe(0);
    expect(item1.availableStores).toHaveLength(1);
    expect(item1.availableStores[0].storeId).toBe(storeA.id);
    expect(item1.availableStores[0].quantityOnHand).toBe(50);
    expect(item1.bestSourceStore).toBeDefined();
    expect(item1.bestSourceStore.storeId).toBe(storeA.id);
    expect(item1.defaultTargetStore).toBeDefined();
    expect(item1.defaultTargetStore.siteId).toBe(siteB.id);
  });

  it("identifies items out of stock in Material & Stock so only Order button applies", async () => {
    const list = await MaterialRequestService.list(userCtx, {});

    const req2 = list.find((r) => r.id === requestOutOfStock.id);
    expect(req2).toBeDefined();
    expect(req2!.items).toHaveLength(1);

    const item2 = req2!.items[0];
    expect(item2.isAvailableInStock).toBe(false);
    expect(item2.totalStock).toBe(0);
    expect(item2.availableStores).toHaveLength(0);
    expect(item2.bestSourceStore).toBeNull();
  });

  it("successfully performs stock transfer from source store to target site store", async () => {
    const transferResult = await InventoryService.transferGoods({
      organizationId: testOrgId,
      sourceStoreId: storeA.id,
      targetStoreId: storeB.id,
      materialId: materialInStock.id,
      quantity: 45,
      referenceDoc: requestInStock.requestNumber,
      notes: `Transfer for Material Request ${requestInStock.requestNumber} · Peva Nagar`,
      userId: adminUser.id,
      role: "SUPER_ADMIN",
    });

    expect(transferResult.success).toBe(true);
    expect(transferResult.sourceRemaining).toBe(5);
    expect(transferResult.inMovement.quantityDelta).toBe(45);

    // Verify source store was decremented
    const sourceBalance = await prisma.stockBalance.findUnique({
      where: { materialId_storeId: { materialId: materialInStock.id, storeId: storeA.id } },
    });
    expect(sourceBalance?.quantityOnHand).toBe(5);

    // Verify target store was incremented
    const targetBalance = await prisma.stockBalance.findUnique({
      where: { materialId_storeId: { materialId: materialInStock.id, storeId: storeB.id } },
    });
    expect(targetBalance?.quantityOnHand).toBe(45);

    // Verify MaterialRequestService.list now shows updated stock at site
    const list = await MaterialRequestService.list(userCtx, {});
    const req1 = list.find((r) => r.id === requestInStock.id);
    expect(req1!.items[0].stockAtSite).toBe(45);
  });
});
