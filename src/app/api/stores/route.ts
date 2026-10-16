import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

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

    const where: any = {
      organizationId: user.organizationId,
      status: "ACTIVE",
    };
    if (siteId) {
      where.siteId = siteId;
    }

    let stores = await prisma.store.findMany({
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

    if (stores.length === 0) {
      // Find active sites in the organization
      let sites = await prisma.site.findMany({
        where: { organizationId: user.organizationId, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      });

      if (sites.length === 0) {
        const defaultSite = await prisma.site.create({
          data: {
            organizationId: user.organizationId,
            name: "Main Construction Site",
            code: "SITE-01",
            address: "Central Project Yard",
          },
        });
        sites = [defaultSite];
      }

      // Provision Main Yard and Secondary Store for sites
      for (const s of sites) {
        await prisma.store.create({
          data: {
            organizationId: user.organizationId,
            siteId: s.id,
            name: `${s.name} — Main Yard`,
            status: "ACTIVE",
          },
        });
        await prisma.store.create({
          data: {
            organizationId: user.organizationId,
            siteId: s.id,
            name: `${s.name} — Secondary Store`,
            status: "ACTIVE",
          },
        });
      }

      // Re-fetch stores with populated records
      stores = await prisma.store.findMany({
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
    }

    return jsonSuccess(stores);
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
  } catch (error) {
    return handleApiError(error);
  }
}
