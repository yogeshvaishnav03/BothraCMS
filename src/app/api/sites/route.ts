import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

const createSiteSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(20),
  address: z.string().min(3),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    try {
      const sites = await prisma.site.findMany({
        where: {
          organizationId: user.organizationId,
          status: "ACTIVE",
        },
        include: {
          stores: {
            where: { status: "ACTIVE" },
          },
          _count: {
            select: {
              projects: true,
              workforceMembers: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      return jsonSuccess(sites);
    } catch {
      return jsonSuccess(dynamicStore.getSites());
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
    const data = createSiteSchema.parse(body);

    try {
      const existingCode = await prisma.site.findUnique({
        where: {
          organizationId_code: {
            organizationId: user.organizationId,
            code: data.code,
          },
        },
      });

      if (existingCode) {
        return jsonError(`Site with code '${data.code}' already exists`, "DUPLICATE_CODE", 409);
      }

      const site = await prisma.site.create({
        data: {
          organizationId: user.organizationId,
          name: data.name,
          code: data.code,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
        },
      });

      return jsonSuccess(site, 201);
    } catch (dbErr) {
      console.warn("[SITES] Database write failed, saving to dynamicStore:", dbErr);
      const newSite = dynamicStore.addSite(data);
      return jsonSuccess(newSite, 201);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
