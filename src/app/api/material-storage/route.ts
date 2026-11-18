import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission, requireProjectAccess } from "@/lib/server-auth";
import { InventoryService } from "@/services/inventory-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const issueMaterialSchema = z.object({
  action: z.literal("issue").optional(),
  materialId: z.string().min(1, "Material is required"),
  storeId: z.string().min(1, "Store/warehouse is required"),
  projectId: z.string().min(1, "Project is required"),
  quantity: z.number().positive("Quantity must be strictly greater than 0"),
  issuedToName: z.string().min(2, "Responsible person name is required"),
  notes: z.string().optional(),
  movementAt: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
});

const returnMaterialSchema = z.object({
  action: z.literal("return"),
  issueId: z.string().optional(),
  materialId: z.string().min(1, "Material is required"),
  storeId: z.string().min(1, "Store/warehouse is required"),
  projectId: z.string().optional(),
  quantity: z.number().positive("Return quantity must be strictly greater than 0"),
  returnedByName: z.string().min(2, "Contractor / person name is required"),
  notes: z.string().optional(),
  movementAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || undefined;
    const siteId = searchParams.get("siteId") || undefined;
    const materialId = searchParams.get("materialId") || undefined;
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");
    const status = searchParams.get("status") || undefined;

    const where: any = {
      organizationId: user.organizationId,
      movementType: { in: ["ISSUE", "RETURN"] },
      isArchived: false,
    };

    if (projectId) where.projectId = projectId;
    if (materialId) where.materialId = materialId;
    if (status) where.issueStatus = status;

    if (siteId) {
      where.OR = [
        { store: { siteId } },
        { project: { siteId } },
      ];
    }

    if (fromDate || toDate) {
      where.movementAt = {};
      if (fromDate) where.movementAt.gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) where.movementAt.lte = new Date(`${toDate}T23:59:59.999Z`);
    }

    const [movements, stockBalances] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          material: {
            include: { category: true },
          },
          store: {
            include: { site: true },
          },
          project: {
            include: { site: true },
          },
          creator: {
            select: { id: true, name: true, role: true },
          },
          attachments: {
            where: { isArchived: false },
            select: {
              id: true,
              fileId: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              category: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ movementAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.stockBalance.findMany({
        where: {
          store: { organizationId: user.organizationId },
        },
        select: {
          materialId: true,
          storeId: true,
          quantityOnHand: true,
        },
      }),
    ]);

    const balanceMap = new Map<string, number>();
    for (const b of stockBalances) {
      const key = `${b.materialId}_${b.storeId}`;
      balanceMap.set(key, (balanceMap.get(key) || 0) + (Number(b.quantityOnHand) || 0));
    }

    const data = movements.map((m: any) => {
      const isReturn = m.movementType === "RETURN";
      const qtyDelta = Number(m.quantityDelta) || 0;
      const movementQty = Math.abs(qtyDelta);
      const remainingQty = balanceMap.get(`${m.materialId}_${m.storeId}`) || 0;
      const totalAvailable = isReturn ? remainingQty : (remainingQty + movementQty);

      return {
        id: m.id,
        movementType: m.movementType,
        materialId: m.materialId,
        materialName: m.material?.name || "Material",
        materialSku: m.material?.sku || "—",
        materialCategory: m.material?.category?.name || "General",
        totalMaterial: totalAvailable,
        issuedMaterial: isReturn ? -movementQty : movementQty,
        quantity: movementQty,
        isReturn,
        remainingMaterial: remainingQty,
        unit: m.unitCode || m.material?.unitCode || "UNIT",
        storeId: m.storeId,
        storeName: m.store?.name || "Store",
        projectId: m.projectId,
        projectName: m.project?.name || "General Project",
        projectCode: m.project?.code || "",
        siteId: m.project?.siteId || m.store?.siteId || "",
        siteName: m.project?.site?.name || m.store?.site?.name || "Site",
        responsiblePerson: m.issuedToName || "Site Supervisor",
        issuedBy: m.creator?.name || "Staff",
        issuedByRole: m.creator?.role || "USER",
        creationDate: m.movementAt ? m.movementAt.toISOString() : m.createdAt.toISOString(),
        status: isReturn ? "RETURNED" : (m.issueStatus || "ISSUED"),
        notes: m.notes || "",
        attachments: m.attachments || [],
        reversalOfId: m.reversalOfId,
      };
    });

    return jsonSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "inventory:issue");

    const body = await req.json();

    // Handle Return Unused Material
    if (body.action === "return") {
      const data = returnMaterialSchema.parse(body);

      const material = await prisma.material.findFirst({
        where: { id: data.materialId, organizationId: user.organizationId },
      });
      if (!material) {
        return jsonError("NotFound: Material not found", "NOT_FOUND", 404);
      }

      const store = await prisma.store.findFirst({
        where: { id: data.storeId, organizationId: user.organizationId },
      });
      if (!store) {
        return jsonError("NotFound: Store not found or outside organization", "NOT_FOUND", 404);
      }

      const result = await prisma.$transaction(async (tx: any) => {
        // 1. Credit stock balance (increment back into store)
        const updatedBalance = await tx.stockBalance.upsert({
          where: {
            materialId_storeId: {
              materialId: data.materialId,
              storeId: data.storeId,
            },
          },
          update: {
            quantityOnHand: { increment: data.quantity },
          },
          create: {
            materialId: data.materialId,
            storeId: data.storeId,
            quantityOnHand: data.quantity,
          },
        });

        // 2. Create RETURN movement (positive delta)
        const movement = await tx.stockMovement.create({
          data: {
            organizationId: user.organizationId,
            materialId: data.materialId,
            storeId: data.storeId,
            movementType: "RETURN",
            quantityDelta: data.quantity,
            unitCode: material.unitCode,
            projectId: data.projectId || null,
            issuedToName: data.returnedByName,
            issueStatus: "RETURNED",
            reversalOfId: data.issueId || null,
            notes: data.notes || `Returned unused material from ${data.returnedByName}`,
            createdBy: user.userId,
            movementAt: data.movementAt ? new Date(data.movementAt) : new Date(),
          },
        });

        // 3. If linked to an issue record, mark status as RETURNED
        if (data.issueId) {
          await tx.stockMovement.update({
            where: { id: data.issueId },
            data: {
              issueStatus: "RETURNED",
            },
          });
        }

        // 4. Record audit event
        await tx.auditEvent.create({
          data: {
            organizationId: user.organizationId,
            actorUserId: user.userId,
            action: "INVENTORY_RETURN",
            entityType: "STOCK_MOVEMENT",
            entityId: movement.id,
            afterJson: JSON.stringify({
              materialId: data.materialId,
              quantity: data.quantity,
              storeId: data.storeId,
              returnedBy: data.returnedByName,
              issueId: data.issueId,
            }),
          },
        });

        return { movement, currentStock: updatedBalance.quantityOnHand };
      });

      return jsonSuccess(result, 201);
    }

    // Default: Issue Material
    const data = issueMaterialSchema.parse(body);

    await requireProjectAccess(user, data.projectId, "inventory:issue");

    const result = await InventoryService.issueGoods({
      organizationId: user.organizationId,
      storeId: data.storeId,
      materialId: data.materialId,
      quantity: data.quantity,
      projectId: data.projectId,
      notes: data.notes,
      attachmentIds: data.attachmentIds,
      userId: user.userId,
      role: user.role as any,
      permissions: user.permissions as any,
    });

    // Update issuedToName and issueStatus on the created movement
    if (result && result.movement) {
      await prisma.stockMovement.update({
        where: { id: result.movement.id },
        data: {
          issuedToName: data.issuedToName,
          issueStatus: "ISSUED",
          ...(data.movementAt ? { movementAt: new Date(data.movementAt) } : {}),
        },
      });
    }

    return jsonSuccess(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
