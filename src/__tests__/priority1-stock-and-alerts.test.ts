import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { InventoryService } from "@/services/inventory-service";

describe("Priority 1: Correct Material Stock, Authoritative Ledger & Low-Stock Alerts", () => {
  let orgId: string;
  let userId: string;
  let siteId: string;
  let storeAId: string;
  let storeBId: string;
  let projectId: string;
  let materialId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `Stock Audit Org ${Date.now()}` },
    });
    orgId = org.id;

    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: "Inventory Manager",
        email: `inv-mgr-${Date.now()}@buildtrack.pro`,
        passwordHash: "hash",
        role: "STOREKEEPER",
      },
    });
    userId = user.id;

    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "North Gateway Site",
        code: `NGS-${Date.now().toString().slice(-4)}`,
        address: "Plot 104, Industrial Corridor",
      },
    });
    siteId = site.id;

    const storeA = await prisma.store.create({
      data: {
        organizationId: orgId,
        siteId,
        name: "Central Yard Store A",
      },
    });
    storeAId = storeA.id;

    const storeB = await prisma.store.create({
      data: {
        organizationId: orgId,
        siteId,
        name: "Secondary Yard Store B",
      },
    });
    storeBId = storeB.id;

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId,
        code: `PRJ-${Date.now().toString().slice(-4)}`,
        name: "Gateway Highrise Project",
      },
    });
    projectId = project.id;

    const material = await prisma.material.create({
      data: {
        organizationId: orgId,
        sku: `CEM-${Date.now().toString().slice(-4)}`,
        name: "UltraTech Portland Cement",
        unitCode: "BAG",
        minStockQty: 25,
        reorderQty: 40,
      },
    });
    materialId = material.id;
  });

  it("1. should accurately record opening balance and receipt into authoritative ledger", async () => {
    // Opening balance of 100 bags
    const receipt = await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId: storeAId,
      projectId,
      movementType: "OPENING",
      idempotencyKey: `IDEMP-OPEN-${Date.now()}`,
      items: [{ materialId, quantity: 100 }],
      userId,
      role: "STOREKEEPER",
    });

    expect(receipt.success).toBe(true);
    expect(receipt.movements[0].movementType).toBe("OPENING");
    expect(receipt.movements[0].quantityDelta).toBe(100);

    // Verify authoritative stock status
    const status = await InventoryService.getMaterialStockStatus(orgId, materialId, storeAId);
    expect(status.availableStock).toBe(100);
    expect(status.minStockQty).toBe(25);
    expect(status.isLowStock).toBe(false);
    expect(status.isZeroStock).toBe(false);
    expect(status.alertSeverity).toBe("NORMAL");
    expect(status.alertReason).toBe("Stock level healthy");
  });

  it("2. should reject duplicate submissions with identical idempotency key", async () => {
    const key = `IDEMP-DUP-${Date.now()}`;

    const res1 = await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId: storeAId,
      idempotencyKey: key,
      items: [{ materialId, quantity: 50 }],
      userId,
      role: "STOREKEEPER",
    });

    const res2 = await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId: storeAId,
      idempotencyKey: key,
      items: [{ materialId, quantity: 50 }],
      userId,
      role: "STOREKEEPER",
    });

    // Responses match identically without double-incrementing stock
    expect(res2.movements[0].id).toBe(res1.movements[0].id);

    const stock = await InventoryService.getAuthoritativeStockFromLedger(orgId, materialId, storeAId);
    expect(stock).toBe(150); // 100 + 50 (only once)
  });

  it("3. should handle inter-store transfer atomically with positive balance checks", async () => {
    const transfer = await InventoryService.transferGoods({
      organizationId: orgId,
      sourceStoreId: storeAId,
      targetStoreId: storeBId,
      materialId,
      quantity: 30,
      userId,
      role: "STOREKEEPER",
    });

    expect(transfer.success).toBe(true);

    const stockA = await InventoryService.getAuthoritativeStockFromLedger(orgId, materialId, storeAId);
    const stockB = await InventoryService.getAuthoritativeStockFromLedger(orgId, materialId, storeBId);

    expect(stockA).toBe(120); // 150 - 30
    expect(stockB).toBe(30);  // 0 + 30
  });

  it("4. should trigger Low Stock warning when balance falls below minimum threshold", async () => {
    // Consume 100 bags from Store A (leaves 20, which is below minStockQty = 25)
    await InventoryService.issueGoods({
      organizationId: orgId,
      storeId: storeAId,
      materialId,
      projectId,
      quantity: 100,
      userId,
      role: "STOREKEEPER",
    });

    const statusA = await InventoryService.getMaterialStockStatus(orgId, materialId, storeAId);
    expect(statusA.availableStock).toBe(20);
    expect(statusA.minStockQty).toBe(25);
    expect(statusA.isLowStock).toBe(true);
    expect(statusA.isZeroStock).toBe(false);
    expect(statusA.alertSeverity).toBe("WARNING");
    expect(statusA.alertReason).toContain("Low Stock Alert");
  });

  it("5. should trigger Out of Stock critical alert when inventory is zero", async () => {
    // Consume remaining 20 bags from Store A
    await InventoryService.issueGoods({
      organizationId: orgId,
      storeId: storeAId,
      materialId,
      projectId,
      quantity: 20,
      userId,
      role: "STOREKEEPER",
    });

    const statusA = await InventoryService.getMaterialStockStatus(orgId, materialId, storeAId);
    expect(statusA.availableStock).toBe(0);
    expect(statusA.isLowStock).toBe(true);
    expect(statusA.isZeroStock).toBe(true);
    expect(statusA.alertSeverity).toBe("CRITICAL");
    expect(statusA.alertReason).toContain("Out of Stock");
  });

  it("6. should strictly prohibit negative stock on attempted over-consumption", async () => {
    await expect(
      InventoryService.issueGoods({
        organizationId: orgId,
        storeId: storeAId,
        materialId,
        quantity: 5,
        userId,
        role: "STOREKEEPER",
      })
    ).rejects.toThrow("Insufficient stock");
  });

  it("7. should reconcile stock balance with authoritative ledger", async () => {
    const reconciled = await InventoryService.reconcileStockBalance(orgId, materialId, storeBId);
    expect(reconciled).toBe(30);

    const balance = await prisma.stockBalance.findUnique({
      where: {
        materialId_storeId: { materialId, storeId: storeBId },
      },
    });
    expect(balance?.quantityOnHand).toBe(30);
  });
});
