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

    const isOwnerOrAdmin = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
    const allowAll = req.nextUrl.searchParams.get("all") === "1";
    const hasSiteFilter = !isOwnerOrAdmin && !allowAll && user.assignedSiteIds && user.assignedSiteIds.length > 0;

    const baseWhere: any = {
      organizationId: user.organizationId,
      status: "ACTIVE",
    };
    if (hasSiteFilter) {
      baseWhere.id = { in: user.assignedSiteIds };
    }

    const compact = req.nextUrl.searchParams.get("compact") === "1";
    if (compact) {
      const sites = await prisma.site.findMany({
        where: baseWhere,
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          status: true,
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
    }

    let sites: any[] = [];
    try {
      sites = await prisma.site.findMany({
        where: baseWhere,
        include: {
          stores: {
            where: { status: "ACTIVE" },
          },
          projects: {
            where: { isArchived: false },
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
    } catch (countErr) {
      // Fallback query if attendanceSessions relation/table is temporarily pending migration
      sites = await prisma.site.findMany({
        where: baseWhere,
        include: {
          stores: {
            where: { status: "ACTIVE" },
          },
          projects: {
            where: { isArchived: false },
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
            },
          },
        },
        orderBy: { name: "asc" },
      }).catch(() => []);
    }

    return jsonSuccess(sites);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const isAuthorized =
      hasPermission(user, "sites:manage") ||
      user.role === "SITE_SUPERVISOR" ||
      user.role === "PROJECT_MANAGER" ||
      user.role === "SUPER_ADMIN" ||
      user.role === "ORG_ADMIN";

    if (!isAuthorized) {
      return jsonError("Forbidden: You do not have permission to create sites", "FORBIDDEN", 403);
    }

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

    // If the creator has site-specific restrictions, automatically append the new site to their assigned list
    if (user.assignedSiteIds && user.assignedSiteIds.length > 0) {
      const updatedSiteIds = Array.from(new Set([...user.assignedSiteIds, site.id]));
      await prisma.user.update({
        where: { id: user.userId },
        data: { assignedSiteIdsJson: JSON.stringify(updatedSiteIds) },
      }).catch(() => {});
    }

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "SITE_CREATED",
        entityType: "SITE",
        entityId: site.id,
        reason: `Construction site created: "${site.name}" (${site.code}) by ${user.name || user.role}`,
      },
    }).catch(() => {});

    return jsonSuccess(site, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
