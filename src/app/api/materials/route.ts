import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

const createMaterialSchema = z.object({
  sku: z.string().min(2),
  name: z.string().min(2),
  categoryId: z.string().uuid().optional(),
  unitCode: z.enum(["BAG", "KG", "TONNE", "LITRE", "METER", "PIECE", "BOX"]),
  minStockQty: z.number().min(0).default(0),
  reorderQty: z.number().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const categoryId = searchParams.get("categoryId");

    try {
      const where: any = { organizationId: user.organizationId, active: true };
      if (categoryId) where.categoryId = categoryId;
      if (search) {
        where.OR = [
          { name: { contains: search } },
          { sku: { contains: search } },
        ];
      }

      const materials = await prisma.material.findMany({
        where,
        include: {
          category: true,
          stockBalances: {
            include: { store: { include: { site: true } } },
          },
        },
        orderBy: { name: "asc" },
      });

      const enriched = materials.map((m) => {
        const totalStock = m.stockBalances.reduce((sum, b) => sum + b.quantityOnHand, 0);
        const isLowStock = m.minStockQty > 0 && totalStock <= m.minStockQty;
        return {
          ...m,
          totalStock,
          isLowStock,
        };
      });

      return jsonSuccess(enriched);
    } catch {
      return jsonSuccess(dynamicStore.getMaterials(search));
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "inventory:adjust");

    const body = await req.json();
    const data = createMaterialSchema.parse(body);

    try {
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

      return jsonSuccess(material, 201);
    } catch (dbErr) {
      console.warn("[MATERIALS] Database write failed, saving to dynamicStore:", dbErr);
      const newMat = dynamicStore.addMaterial(data);
      return jsonSuccess(newMat, 201);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
