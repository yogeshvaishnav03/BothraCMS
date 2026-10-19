import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const editMaterialSchema = z.object({
  name: z.string().min(2).optional(),
  sku: z.string().min(2).optional(),
  unitCode: z.enum(["BAG", "KG", "TONNE", "LITRE", "METER", "PIECE", "BOX"]).optional(),
  minStockQty: z.number().min(0).optional(),
  reorderQty: z.number().min(0).optional(),
  categoryId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  reason: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const material = await prisma.material.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      include: {
        category: true,
        stockBalances: {
          include: { store: { include: { site: true } } },
        },
      },
    });

    if (!material) return jsonError("Material not found", "NOT_FOUND", 404);

    return jsonSuccess(material);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "inventory:adjust");

    const material = await prisma.material.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
    });
    if (!material) return jsonError("Material not found", "NOT_FOUND", 404);

    const body = await req.json();
    const data = editMaterialSchema.parse(body);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.sku !== undefined) updateData.sku = data.sku.trim();
    if (data.unitCode !== undefined) updateData.unitCode = data.unitCode;
    if (data.minStockQty !== undefined) updateData.minStockQty = data.minStockQty;
    if (data.reorderQty !== undefined) updateData.reorderQty = data.reorderQty;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.active !== undefined) updateData.active = data.active;

    const updated = await prisma.material.update({
      where: { id: material.id },
      data: updateData,
      include: { category: true },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "MATERIAL_EDITED",
        entityType: "MATERIAL",
        entityId: material.id,
        reason: data.reason || "Material configuration updated",
        beforeJson: JSON.stringify({
          name: material.name,
          sku: material.sku,
          unitCode: material.unitCode,
          minStockQty: material.minStockQty,
          reorderQty: material.reorderQty,
          active: material.active,
        }),
        afterJson: JSON.stringify({
          name: updated.name,
          sku: updated.sku,
          unitCode: updated.unitCode,
          minStockQty: updated.minStockQty,
          reorderQty: updated.reorderQty,
          active: updated.active,
        }),
      },
    });

    return jsonSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "inventory:adjust");

    const material = await prisma.material.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
    });
    if (!material) return jsonError("Material not found", "NOT_FOUND", 404);

    // Soft delete material
    await prisma.material.update({
      where: { id: material.id },
      data: { active: false },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "MATERIAL_ARCHIVED",
        entityType: "MATERIAL",
        entityId: material.id,
        beforeJson: JSON.stringify({ name: material.name, sku: material.sku }),
      },
    });

    return jsonSuccess({ message: "Material archived successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}
