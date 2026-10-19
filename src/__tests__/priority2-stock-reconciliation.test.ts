import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { InventoryService } from "@/services/inventory-service";

describe("Priority 2: Consistent and Correct Stock Calculations & Reconciliation", () => {
  const orgId = "org-test-p2";
  const userId = "user-stock-p2";
  let siteId: string;
  let storeId: string;
  let materialAId: string;
  let materialBId: string;
  let materialCId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.idempotencyRecord.deleteMany({ where: { organizationId: orgId } });
    await prisma.stockMovement.deleteMany({ where: { organizationId: orgId } });
    await prisma.stockBalance.deleteMany({});
    await prisma.material.deleteMany({ where: { organizationId: orgId } });
    await prisma.store.deleteMany({ where: { organizationId: orgId } });
    await prisma.site.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    // Seed org and user
    await prisma.organization.create({
      data: { id: orgId, name: "Priority 2 Org", status: "ACTIVE" },
    });
    await prisma.user.create({
      data: { id: userId, organizationId: orgId, name: "Storekeeper", email: "sk@p2.test", role: "STOREKEEPER", passwordHash: "test-hash" },
    });

    // Seed site & store
    const site = await prisma.site.create({
      data: { organizationId: orgId, name: "Site Central", code: "SC-100", address: "Central Site Way", status: "ACTIVE" },
    });
    siteId = site.id;

    const store = await prisma.store.create({
      data: { organizationId: orgId, siteId: site.id, name: "Main Yard Store" },
    });
    storeId = store.id;

    // Seed materials with different minStockQty thresholds
    const matA = await prisma.material.create({
      data: {
        organizationId: orgId,
        sku: "CEM-001",
        name: "OPC 53 Cement",
        unitCode: "BAG",
        minStockQty: 50,
        active: true,
      },
    });
    materialAId = matA.id;

    const matB = await prisma.material.create({
      data: {
        organizationId: orgId,
        sku: "STL-012",
        name: "12mm TMT Steel",
        unitCode: "KG",
        minStockQty: 100,
        active: true,
      },
    });
    materialBId = matB.id;

    const matC = await prisma.material.create({
      data: {
        organizationId: orgId,
        sku: "SND-001",
        name: "River Sand",
        unitCode: "CFT",
        minStockQty: 200,
        active: true,
      },
    });
    materialCId = matC.id;
  });

  it("2.1 Correctly computes authoritative stock from raw ledger sum (receipts minus issues)", async () => {
    // Receive 100 bags of Cement
    await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId,
      items: [{ materialId: materialAId, quantity: 100 }],
      userId,
      role: "STOREKEEPER",
    });

    // Issue 30 bags of Cement
    await InventoryService.issueGoods({
      organizationId: orgId,
      storeId,
      materialId: materialAId,
      quantity: 30,
      userId,
      role: "STOREKEEPER",
    });

    const summary = await InventoryService.getAuthoritativeStockSummary(orgId, siteId);
    const cementSummary = summary.find((s) => s.materialId === materialAId);

    expect(cementSummary).toBeDefined();
    expect(cementSummary!.authoritativeStock).toBe(70);
    expect(cementSummary!.minStock).toBe(50);
    expect(cementSummary!.isLowStock).toBe(false);
    expect(cementSummary!.isZeroStock).toBe(false);
    expect(cementSummary!.alertSeverity).toBe("NORMAL");
  });

  it("2.2 Identifies and triggers low stock alert when stock is strictly below minStock", async () => {
    // Receive 100 bags of Cement
    await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId,
      items: [{ materialId: materialAId, quantity: 100 }],
      userId,
      role: "STOREKEEPER",
    });

    // Issue 60 bags -> leaves 40 bags (minStock = 50)
    await InventoryService.issueGoods({
      organizationId: orgId,
      storeId,
      materialId: materialAId,
      quantity: 60,
      userId,
      role: "STOREKEEPER",
    });

    const summary = await InventoryService.getAuthoritativeStockSummary(orgId, siteId);
    const cementSummary = summary.find((s) => s.materialId === materialAId);

    expect(cementSummary!.authoritativeStock).toBe(40);
    expect(cementSummary!.minStock).toBe(50);
    expect(cementSummary!.isLowStock).toBe(true);
    expect(cementSummary!.isZeroStock).toBe(false);
    expect(cementSummary!.alertSeverity).toBe("WARNING");
    expect(cementSummary!.stockStatus).toBe("LOW_STOCK");
    expect(cementSummary!.alertReason).toContain("below minimum safety threshold: 50");
  });

  it("2.3 Stock exactly equal to minStock is AT threshold and NOT considered low stock", async () => {
    // Receive 100 bags of Cement
    await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId,
      items: [{ materialId: materialAId, quantity: 100 }],
      userId,
      role: "STOREKEEPER",
    });

    // Issue 50 bags -> leaves exactly 50 bags (minStock = 50)
    await InventoryService.issueGoods({
      organizationId: orgId,
      storeId,
      materialId: materialAId,
      quantity: 50,
      userId,
      role: "STOREKEEPER",
    });

    const summary = await InventoryService.getAuthoritativeStockSummary(orgId, siteId);
    const cementSummary = summary.find((s) => s.materialId === materialAId);

    expect(cementSummary!.authoritativeStock).toBe(50);
    expect(cementSummary!.minStock).toBe(50);
    expect(cementSummary!.isLowStock).toBe(false);
    expect(cementSummary!.alertSeverity).toBe("NORMAL");
    expect(cementSummary!.alertReason).toContain("At threshold: 50");
  });

  it("2.4 Zero stock triggers critical alert severity", async () => {
    // Material B (Steel) has no stock movements -> stock = 0, minStock = 100
    const summary = await InventoryService.getAuthoritativeStockSummary(orgId, siteId);
    const steelSummary = summary.find((s) => s.materialId === materialBId);

    expect(steelSummary!.authoritativeStock).toBe(0);
    expect(steelSummary!.isZeroStock).toBe(true);
    expect(steelSummary!.isLowStock).toBe(true);
    expect(steelSummary!.alertSeverity).toBe("CRITICAL");
    expect(steelSummary!.alertReason).toContain("Out of stock");
  });

  it("2.5 Reconciles corrupted/stale StockBalance cache with authoritative ledger sum", async () => {
    // Receive 100 CFT sand
    await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId,
      items: [{ materialId: materialCId, quantity: 100 }],
      userId,
      role: "STOREKEEPER",
    });

    // Deliberately corrupt the cached StockBalance to simulate cache desynchronization
    const cachedBalance = await prisma.stockBalance.findUnique({
      where: {
        materialId_storeId: { materialId: materialCId, storeId },
      },
    });
    expect(cachedBalance).toBeDefined();

    await prisma.stockBalance.update({
      where: { id: cachedBalance!.id },
      data: { quantityOnHand: 999 }, // Corrupted value
    });

    // Querying authoritative stock summary must detect the discrepancy and reconcile it back to 100
    const summary = await InventoryService.getAuthoritativeStockSummary(orgId, siteId);
    const sandSummary = summary.find((s) => s.materialId === materialCId);

    expect(sandSummary!.authoritativeStock).toBe(100);

    // Verify StockBalance was automatically healed
    const healedBalance = await prisma.stockBalance.findUnique({
      where: {
        materialId_storeId: { materialId: materialCId, storeId },
      },
    });
    expect(healedBalance!.quantityOnHand).toBe(100);
  });
});
