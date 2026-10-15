import { prisma } from "@/lib/db";
import { assertPermission, Role } from "@/lib/permissions";
import { roundQuantity, safeAddQuantity, safeSubtractQuantity } from "@/lib/financial-math";

export interface GoodsReceiptItem {
  materialId: string;
  quantity: number;
  unitRate?: number; // paise per unit
}

export interface ReceiveGoodsInput {
  organizationId: string;
  storeId: string;
  vendorPartyId?: string;
  referenceDoc?: string;
  notes?: string;
  items: GoodsReceiptItem[];
  userId: string;
  role: Role;
}

export interface IssueGoodsInput {
  organizationId: string;
  storeId: string;
  materialId: string;
  quantity: number;
  projectId?: string;
  taskId?: string;
  notes?: string;
  userId: string;
  role: Role;
}

export interface TransferGoodsInput {
  organizationId: string;
  sourceStoreId: string;
  targetStoreId: string;
  materialId: string;
  quantity: number;
  referenceDoc?: string;
  notes?: string;
  userId: string;
  role: Role;
}

export interface AdjustStockInput {
  organizationId: string;
  storeId: string;
  materialId: string;
  quantityDelta: number; // positive or negative
  reason: string;
  userId: string;
  role: Role;
}

export class InventoryService {
  /**
   * Goods Receipt: atomically inserts positive stock movements and updates balances
   */
  static async receiveGoods(input: ReceiveGoodsInput) {
    assertPermission(input.role, "inventory:receipt");

    if (!input.items || input.items.length === 0) {
      throw new Error("Goods receipt requires at least one item");
    }

    // Verify store belongs to organization
    const store = await prisma.store.findFirst({
      where: { id: input.storeId, organizationId: input.organizationId },
    });
    if (!store) {
      throw new Error("NotFound: Store not found or outside organization scope");
    }

    return await prisma.$transaction(async (tx) => {
      const createdMovements = [];

      for (const item of input.items) {
        if (item.quantity <= 0) {
          throw new Error(`Quantity must be strictly positive for receipts: received ${item.quantity}`);
        }

        const material = await tx.material.findFirst({
          where: { id: item.materialId, organizationId: input.organizationId },
        });
        if (!material) {
          throw new Error(`NotFound: Material ${item.materialId} not found`);
        }

        // 1. Insert StockMovement
        const movement = await tx.stockMovement.create({
          data: {
            organizationId: input.organizationId,
            materialId: material.id,
            storeId: input.storeId,
            movementType: "RECEIPT",
            quantityDelta: item.quantity,
            unitCode: material.unitCode,
            unitRate: item.unitRate ?? null,
            vendorPartyId: input.vendorPartyId ?? null,
            referenceDoc: input.referenceDoc ?? null,
            notes: input.notes ?? null,
            createdBy: input.userId,
          },
        });
        createdMovements.push(movement);

        // 2. Upsert StockBalance projection
        const existingBalance = await tx.stockBalance.findUnique({
          where: {
            materialId_storeId: {
              materialId: material.id,
              storeId: input.storeId,
            },
          },
        });

        if (existingBalance) {
          await tx.stockBalance.update({
            where: { id: existingBalance.id },
            data: {
              quantityOnHand: safeAddQuantity(existingBalance.quantityOnHand, item.quantity),
            },
          });
        } else {
          await tx.stockBalance.create({
            data: {
              materialId: material.id,
              storeId: input.storeId,
              quantityOnHand: roundQuantity(item.quantity),
            },
          });
        }
      }

      // 3. Log Audit Event
      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "INVENTORY_RECEIPT",
          entityType: "STOCK_MOVEMENT",
          entityId: createdMovements[0].id,
          afterJson: JSON.stringify({
            storeId: input.storeId,
            vendorPartyId: input.vendorPartyId,
            itemCount: input.items.length,
          }),
        },
      });

      return {
        success: true,
        movements: createdMovements,
      };
    });
  }

  /**
   * Material Issue: checks stock availability and atomically records consumption
   */
  static async issueGoods(input: IssueGoodsInput) {
    assertPermission(input.role, "inventory:issue");

    if (input.quantity <= 0) {
      throw new Error(`Quantity must be strictly positive for issue: requested ${input.quantity}`);
    }

    const store = await prisma.store.findFirst({
      where: { id: input.storeId, organizationId: input.organizationId },
    });
    if (!store) {
      throw new Error("NotFound: Store not found or outside organization scope");
    }

    const material = await prisma.material.findFirst({
      where: { id: input.materialId, organizationId: input.organizationId },
    });
    if (!material) {
      throw new Error("NotFound: Material not found");
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Check current balance
      const balance = await tx.stockBalance.findUnique({
        where: {
          materialId_storeId: {
            materialId: material.id,
            storeId: input.storeId,
          },
        },
      });

      const currentStock = balance ? roundQuantity(balance.quantityOnHand) : 0;
      if (currentStock < input.quantity) {
        throw new Error(
          `Insufficient stock: Store has ${currentStock} ${material.unitCode} of ${material.name}; cannot issue ${input.quantity} ${material.unitCode}`
        );
      }

      // 2. Insert StockMovement (negative delta)
      const movement = await tx.stockMovement.create({
        data: {
          organizationId: input.organizationId,
          materialId: material.id,
          storeId: input.storeId,
          movementType: "ISSUE",
          quantityDelta: -input.quantity,
          unitCode: material.unitCode,
          projectId: input.projectId ?? null,
          taskId: input.taskId ?? null,
          notes: input.notes ?? null,
          createdBy: input.userId,
        },
      });

      // 3. Decrement StockBalance
      await tx.stockBalance.update({
        where: { id: balance!.id },
        data: {
          quantityOnHand: safeSubtractQuantity(currentStock, input.quantity),
        },
      });

      // 4. Log Audit Event
      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "INVENTORY_ISSUE",
          entityType: "STOCK_MOVEMENT",
          entityId: movement.id,
          afterJson: JSON.stringify({
            materialId: material.id,
            quantity: input.quantity,
            remainingStock: currentStock - input.quantity,
            projectId: input.projectId,
          }),
        },
      });

      return {
        success: true,
        movement,
        remainingStock: currentStock - input.quantity,
      };
    });
  }

  /**
   * Inter-store Transfer: atomically decrements source and increments target store
   */
  static async transferGoods(input: TransferGoodsInput) {
    assertPermission(input.role, "inventory:transfer");

    if (input.quantity <= 0) {
      throw new Error(`Quantity must be strictly positive: requested ${input.quantity}`);
    }

    if (input.sourceStoreId === input.targetStoreId) {
      throw new Error("Source store and target store cannot be identical");
    }

    const sourceStore = await prisma.store.findFirst({
      where: { id: input.sourceStoreId, organizationId: input.organizationId },
    });
    if (!sourceStore) {
      throw new Error("NotFound: Source store not found or outside organization scope");
    }

    const targetStore = await prisma.store.findFirst({
      where: { id: input.targetStoreId, organizationId: input.organizationId },
    });
    if (!targetStore) {
      throw new Error("NotFound: Target store not found or outside organization scope");
    }

    const material = await prisma.material.findFirst({
      where: { id: input.materialId, organizationId: input.organizationId },
    });
    if (!material) {
      throw new Error("NotFound: Material not found");
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Verify source stock
      const sourceBalance = await tx.stockBalance.findUnique({
        where: {
          materialId_storeId: {
            materialId: material.id,
            storeId: input.sourceStoreId,
          },
        },
      });

      const currentSourceStock = sourceBalance ? roundQuantity(sourceBalance.quantityOnHand) : 0;
      if (currentSourceStock < input.quantity) {
        throw new Error(
          `Insufficient stock in source store: has ${currentSourceStock} ${material.unitCode}; cannot transfer ${input.quantity} ${material.unitCode}`
        );
      }

      // 2. Decrement source store
      const outMovement = await tx.stockMovement.create({
        data: {
          organizationId: input.organizationId,
          materialId: material.id,
          storeId: input.sourceStoreId,
          movementType: "TRANSFER_OUT",
          quantityDelta: -input.quantity,
          unitCode: material.unitCode,
          referenceDoc: input.referenceDoc ?? null,
          notes: `Transfer to store ${input.targetStoreId}. ${input.notes || ""}`.trim(),
          createdBy: input.userId,
        },
      });

      await tx.stockBalance.update({
        where: { id: sourceBalance!.id },
        data: {
          quantityOnHand: safeSubtractQuantity(currentSourceStock, input.quantity),
        },
      });

      // 3. Increment target store
      const inMovement = await tx.stockMovement.create({
        data: {
          organizationId: input.organizationId,
          materialId: material.id,
          storeId: input.targetStoreId,
          movementType: "TRANSFER_IN",
          quantityDelta: input.quantity,
          unitCode: material.unitCode,
          referenceDoc: input.referenceDoc ?? null,
          notes: `Transfer from store ${input.sourceStoreId}. ${input.notes || ""}`.trim(),
          createdBy: input.userId,
        },
      });

      const targetBalance = await tx.stockBalance.findUnique({
        where: {
          materialId_storeId: {
            materialId: material.id,
            storeId: input.targetStoreId,
          },
        },
      });

      if (targetBalance) {
        await tx.stockBalance.update({
          where: { id: targetBalance.id },
          data: {
            quantityOnHand: safeAddQuantity(targetBalance.quantityOnHand, input.quantity),
          },
        });
      } else {
        await tx.stockBalance.create({
          data: {
            materialId: material.id,
            storeId: input.targetStoreId,
            quantityOnHand: roundQuantity(input.quantity),
          },
        });
      }

      // 4. Log Audit Event
      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "INVENTORY_TRANSFER",
          entityType: "STOCK_MOVEMENT",
          entityId: outMovement.id,
          afterJson: JSON.stringify({
            materialId: material.id,
            sourceStoreId: input.sourceStoreId,
            targetStoreId: input.targetStoreId,
            quantity: input.quantity,
          }),
        },
      });

      return {
        success: true,
        sourceRemaining: currentSourceStock - input.quantity,
        outMovement,
        inMovement,
      };
    });
  }

  /**
   * Stock Adjustment: handles verified physical count discrepancy with mandatory reason
   */
  static async adjustStock(input: AdjustStockInput) {
    assertPermission(input.role, "inventory:adjust");

    if (!input.reason || input.reason.trim().length < 5) {
      throw new Error("A detailed justification reason is mandatory for stock adjustments");
    }

    if (input.quantityDelta === 0) {
      throw new Error("Adjustment delta cannot be zero");
    }

    const store = await prisma.store.findFirst({
      where: { id: input.storeId, organizationId: input.organizationId },
    });
    if (!store) {
      throw new Error("NotFound: Store not found or outside organization scope");
    }

    const material = await prisma.material.findFirst({
      where: { id: input.materialId, organizationId: input.organizationId },
    });
    if (!material) {
      throw new Error("NotFound: Material not found");
    }

    return await prisma.$transaction(async (tx) => {
      const balance = await tx.stockBalance.findUnique({
        where: {
          materialId_storeId: {
            materialId: material.id,
            storeId: input.storeId,
          },
        },
      });

      const currentStock = balance ? balance.quantityOnHand : 0;
      const newStock = roundQuantity(currentStock + input.quantityDelta);

      if (newStock < 0) {
        throw new Error(
          `Adjustment would result in negative stock (${newStock} ${material.unitCode}); aborted`
        );
      }

      const movement = await tx.stockMovement.create({
        data: {
          organizationId: input.organizationId,
          materialId: material.id,
          storeId: input.storeId,
          movementType: "ADJUSTMENT",
          quantityDelta: input.quantityDelta,
          unitCode: material.unitCode,
          notes: `ADJUSTMENT: ${input.reason}`,
          createdBy: input.userId,
        },
      });

      if (balance) {
        await tx.stockBalance.update({
          where: { id: balance.id },
          data: { quantityOnHand: newStock },
        });
      } else {
        await tx.stockBalance.create({
          data: {
            materialId: material.id,
            storeId: input.storeId,
            quantityOnHand: newStock,
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "STOCK_ADJUSTMENT",
          entityType: "STOCK_MOVEMENT",
          entityId: movement.id,
          reason: input.reason,
          beforeJson: JSON.stringify({ stock: currentStock }),
          afterJson: JSON.stringify({ stock: newStock }),
        },
      });

      return {
        success: true,
        movement,
        newStock,
      };
    });
  }

  /**
   * Retrieves chronological authoritative ledger for a material
   */
  static async getMaterialLedger(
    organizationId: string,
    materialId: string,
    storeId?: string
  ) {
    const material = await prisma.material.findFirst({
      where: { id: materialId, organizationId },
      include: { category: true },
    });
    if (!material) {
      throw new Error("NotFound: Material not found");
    }

    const whereClause: any = {
      organizationId,
      materialId,
    };
    if (storeId) {
      whereClause.storeId = storeId;
    }

    const movements = await prisma.stockMovement.findMany({
      where: whereClause,
      include: {
        store: true,
        vendor: true,
        project: true,
        task: true,
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { movementAt: "asc" },
    });

    let runningBalance = 0;
    let totalReceived = 0;
    let totalIssued = 0;

    const ledgerEntries = movements.map((m) => {
      runningBalance += m.quantityDelta;
      if (m.quantityDelta > 0) totalReceived += m.quantityDelta;
      if (m.quantityDelta < 0) totalIssued += Math.abs(m.quantityDelta);

      return {
        id: m.id,
        date: m.movementAt,
        type: m.movementType,
        quantityDelta: m.quantityDelta,
        unitCode: m.unitCode,
        unitRate: m.unitRate,
        runningBalance,
        storeName: m.store.name,
        vendorName: m.vendor?.name ?? null,
        projectName: m.project?.name ?? null,
        taskTitle: m.task?.title ?? null,
        referenceDoc: m.referenceDoc,
        notes: m.notes,
        createdByName: m.creator.name,
      };
    });

    return {
      material,
      currentBalance: runningBalance,
      totalReceived,
      totalIssued,
      entries: ledgerEntries,
    };
  }
}
