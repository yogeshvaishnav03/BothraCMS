import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const site = await prisma.site.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
        status: "ACTIVE",
      },
      include: {
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
        stores: {
          where: { status: "ACTIVE" },
        },
        _count: {
          select: {
            projects: true,
            workforceMembers: true,
            attendanceSessions: true,
          },
        },
      },
    });

    if (!site) return jsonError("Site not found", "NOT_FOUND", 404);

    const activeProjects = site.projects.filter(
      (p) => !["COMPLETED", "ARCHIVED"].includes(p.status)
    );
    const completedProjects = site.projects.filter(
      (p) => p.status === "COMPLETED"
    );

    return jsonSuccess({
      site,
      activeProjects,
      completedProjects,
      canDeleteDirectly: activeProjects.length === 0,
    });
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

    assertPermission(user.role, "sites:manage");

    // Check optional transferToSiteId from query or body
    let transferToSiteId: string | undefined =
      req.nextUrl.searchParams.get("transferToSiteId") || undefined;

    if (!transferToSiteId) {
      try {
        const body = await req.json();
        if (body && typeof body.transferToSiteId === "string") {
          transferToSiteId = body.transferToSiteId.trim() || undefined;
        }
      } catch {
        // Body may be empty on standard DELETE
      }
    }

    const site = await prisma.site.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
        status: "ACTIVE",
      },
      include: {
        projects: {
          where: { isArchived: false },
          select: { id: true, name: true, code: true, status: true },
        },
      },
    });

    if (!site) return jsonError("Site not found", "NOT_FOUND", 404);

    // Active/incomplete projects
    const activeProjects = site.projects.filter(
      (p) => !["COMPLETED", "ARCHIVED"].includes(p.status)
    );

    // If site has active projects and no transfer target was specified:
    if (activeProjects.length > 0 && !transferToSiteId) {
      return jsonError(
        `Site '${site.name}' has ${activeProjects.length} active project(s). Transfer them to another site before deleting.`,
        "PROJECTS_REQUIRE_TRANSFER",
        400,
        {
          requiresTransfer: true,
          activeProjects: activeProjects.map((p) => ({
            id: p.id,
            name: p.name,
            code: p.code,
            status: p.status,
          })),
        }
      );
    }

    // If transfer target is provided, validate it
    let targetSite: any = null;
    if (transferToSiteId) {
      if (transferToSiteId === site.id) {
        return jsonError(
          "Cannot transfer projects to the same site being deleted",
          "INVALID_TARGET_SITE",
          400
        );
      }

      targetSite = await prisma.site.findFirst({
        where: {
          id: transferToSiteId,
          organizationId: user.organizationId,
          status: "ACTIVE",
        },
      });

      if (!targetSite) {
        return jsonError(
          "Destination site not found or is inactive",
          "INVALID_TARGET_SITE",
          400
        );
      }
    }

    // Perform atomic transfer and archival
    await prisma.$transaction(async (tx) => {
      // 1. If target site exists, transfer projects and workforce
      if (targetSite) {
        await tx.project.updateMany({
          where: { siteId: site.id, organizationId: user.organizationId },
          data: { siteId: targetSite.id },
        });

        await tx.workforceMember.updateMany({
          where: { defaultSiteId: site.id, organizationId: user.organizationId },
          data: { defaultSiteId: targetSite.id },
        });
      }

      // 2. Archive active stores belonging to this site
      await tx.store.updateMany({
        where: { siteId: site.id, organizationId: user.organizationId },
        data: { status: "ARCHIVED" },
      });

      // 3. Archive the site itself and append timestamp to release code
      await tx.site.update({
        where: { id: site.id },
        data: {
          status: "ARCHIVED",
          code: `${site.code}#ARCHIVED_${Date.now()}`,
        },
      });

      // 4. Audit Log
      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: targetSite ? "SITE_DELETED_WITH_TRANSFER" : "SITE_DELETED",
          entityType: "SITE",
          entityId: site.id,
          reason: targetSite
            ? `Site "${site.name}" (${site.code}) archived. ${activeProjects.length} active project(s) transferred to "${targetSite.name}" (${targetSite.code}).`
            : `Site "${site.name}" (${site.code}) archived. All projects were completed or none existed.`,
        },
      });
    });

    if (targetSite) {
      return jsonSuccess({
        message: `Site "${site.name}" deleted successfully. ${activeProjects.length} active project(s) transferred to "${targetSite.name}".`,
        deletedSiteId: site.id,
        deletedSiteName: site.name,
        transferredCount: activeProjects.length,
        targetSiteId: targetSite.id,
        targetSiteName: targetSite.name,
      });
    }

    return jsonSuccess({
      message: `Site "${site.name}" deleted successfully.`,
      deletedSiteId: site.id,
      deletedSiteName: site.name,
      transferredCount: 0,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
