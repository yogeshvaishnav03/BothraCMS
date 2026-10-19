import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { InventoryService } from "@/services/inventory-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createMaterialSchema = z.object({
  sku: z.string().min(2).max(50),
  name: z.string().min(2),
  categoryId: z.string().optional(),
  unitCode: z.string().min(1).default("PIECE"),
  minStockQty: z.number().min(0).default(0),
  reorderQty: z.number().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase();
    const categoryId = searchParams.get("categoryId");

    // Unified Authoritative Stock Calculation from Ledger
    const allStockStatus = await InventoryService.getAuthoritativeStockSummary(user.organizationId);

    let filtered = allStockStatus;
    if (categoryId) {
      filtered = filtered.filter((m) => m.categoryId === categoryId);
    }
    if (search) {
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(search) ||
          m.sku.toLowerCase().includes(search)
      );
    }

    return jsonSuccess(filtered);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "inventory:adjust");

    const body = await req.json();
    const data = createMaterialSchema.parse(body);

    const material = await prisma.material.create({
      data: {
        organizationId: user.organizationId,
        sku: data.sku,
        name: data.name,
        categoryId: data.categoryId,
        unitCode: data.unitCode,
        minStockQty: data.minStockQty,
        reorderQty: data.reorderQty,
      },
      include: { category: true },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "MATERIAL_CREATED",
        entityType: "MATERIAL",
        entityId: material.id,
        afterJson: JSON.stringify({ name: material.name, sku: material.sku }),
        reason: "Material item added to inventory catalog",
      },
    });

    return jsonSuccess(material, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "inventory:adjust");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Material ID is required", "BAD_REQUEST", 400);

    const material = await prisma.material.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!material) {
      return jsonError("Material not found", "NOT_FOUND", 404);
    }

    // Soft-delete / Archival to preserve historical ledger records
    await prisma.material.update({
      where: { id: material.id },
      data: {
        active: false,
        isArchived: true,
        archivedAt: new Date(),
        archivedById: user.userId,
        archiveReason: "Material archived by authorized user",
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "MATERIAL_ARCHIVED",
        entityType: "MATERIAL",
        entityId: material.id,
        beforeJson: JSON.stringify({ name: material.name, sku: material.sku, active: material.active }),
        afterJson: JSON.stringify({ active: false, isArchived: true }),
        reason: "Material archived to preserve stock movement ledger history",
      },
    });

    return jsonSuccess({ archived: true, deleted: true, id: material.id });
  } catch (error) {
    return handleApiError(error);
  }
}
