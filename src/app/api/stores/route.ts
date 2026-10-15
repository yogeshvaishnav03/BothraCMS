import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

const createStoreSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(2),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");

    try {
      const where: any = {
        organizationId: user.organizationId,
        status: "ACTIVE",
      };
      if (siteId) {
        where.siteId = siteId;
      }

      const stores = await prisma.store.findMany({
        where,
        include: {
          site: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          _count: {
            select: {
              stockBalances: true,
              stockMovements: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      return jsonSuccess(stores);
    } catch {
      return jsonSuccess(dynamicStore.getStores(siteId));
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "sites:manage");

    const body = await req.json();
    const data = createStoreSchema.parse(body);

    try {
      // Verify site belongs to organization
      const site = await prisma.site.findFirst({
        where: {
          id: data.siteId,
          organizationId: user.organizationId,
        },
      });

      if (!site) {
        return jsonError("Site not found or outside organization", "SITE_NOT_FOUND", 404);
      }

      const store = await prisma.store.create({
        data: {
          organizationId: user.organizationId,
          siteId: data.siteId,
          name: data.name,
        },
        include: {
          site: true,
        },
      });

      return jsonSuccess(store, 201);
    } catch (dbErr) {
      console.warn("[STORES] Database write failed, saving to dynamicStore:", dbErr);
      const newStore = dynamicStore.addStore(data);
      return jsonSuccess(newStore, 201);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
