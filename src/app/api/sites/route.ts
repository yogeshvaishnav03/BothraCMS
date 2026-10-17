import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

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

    const sites = await prisma.site.findMany({
      where: {
        organizationId: user.organizationId,
        status: "ACTIVE",
      },
      include: {
        stores: {
          where: { status: "ACTIVE" },
        },
        projects: {
          where: { status: { in: ["PLANNING", "IN_PROGRESS", "ACTIVE"] } },
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            budgetAmount: true,
            _count: {
              select: { tasks: true, dailyReports: true },
            },
          },
        },
        _count: {
          select: {
            projects: true,
            workforceMembers: true,
            attendanceSessions: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return jsonSuccess(sites);
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

    // Auto-create default site stores so inventory is immediately usable for this site
    await prisma.store.create({
      data: {
        organizationId: user.organizationId,
        siteId: site.id,
        name: `${site.name} — Main Yard`,
        status: "ACTIVE",
      },
    });
    await prisma.store.create({
      data: {
        organizationId: user.organizationId,
        siteId: site.id,
        name: `${site.name} — Secondary Store`,
        status: "ACTIVE",
      },
    });

    return jsonSuccess(site, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
