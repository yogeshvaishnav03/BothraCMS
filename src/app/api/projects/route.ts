import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireUserContext,
  requirePermission,
  getUserAccessibleProjectIds,
  canReadFinance,
} from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createProjectSchema = z.object({
  siteId: z.string().min(1),
  code: z.string().min(2).max(20),
  name: z.string().min(2),
  managerUserId: z.string().min(1).optional(),
  budgetAmount: z.number().min(0).default(0), // stored in rupees/paise
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status");
    const includeArchived = searchParams.get("includeArchived") === "true";

    const accessibleProjectIds = await getUserAccessibleProjectIds(user);

    const where: any = { organizationId: user.organizationId };
    if (!includeArchived) {
      where.isArchived = false;
    }
    if (accessibleProjectIds !== null) {
      where.id = { in: accessibleProjectIds };
    }
    if (siteId) where.siteId = siteId;
    if (status) where.status = status;

    let projects = await prisma.project.findMany({
      where,
      include: {
        site: true,
        manager: { select: { id: true, name: true, email: true } },
        _count: {
          select: { tasks: true, dailyReports: true, stockMovements: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (projects.length === 0 && !siteId && !status && !includeArchived && accessibleProjectIds === null) {
      const totalCount = await prisma.project.count({
        where: { organizationId: user.organizationId },
      });
      if (totalCount === 0) {
        let site = await prisma.site.findFirst({
          where: { organizationId: user.organizationId, status: "ACTIVE" },
        });
        if (!site) {
          site = await prisma.site.create({
            data: {
              organizationId: user.organizationId,
              name: "Main Site / Head Office",
              code: `SITE-${user.organizationId.slice(-4)}`,
              address: "Central Site Operations",
              status: "ACTIVE",
            },
          });
        }
        const defaultProject = await prisma.project.create({
          data: {
            organizationId: user.organizationId,
            siteId: site.id,
            code: "PRJ-GEN",
            name: "General Site Operations",
            status: "IN_PROGRESS",
          },
          include: {
            site: true,
            manager: { select: { id: true, name: true, email: true } },
            _count: {
              select: { tasks: true, dailyReports: true, stockMovements: true },
            },
          },
        });
        projects.push(defaultProject);
      }
    }

    const hasFinanceAccess = canReadFinance(user);
    const sanitizedProjects = projects.map((p) => {
      const copy: any = { ...p };
      if (!hasFinanceAccess) {
        delete copy.budgetAmount;
      }
      return copy;
    });

    return jsonSuccess(sanitizedProjects);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "projects:write");

    const body = await req.json();
    const data = createProjectSchema.parse(body);

    // Verify site belongs to organization
    const site = await prisma.site.findFirst({
      where: { id: data.siteId, organizationId: user.organizationId },
    });
    if (!site) {
      return jsonError("Site not found or outside organization scope", "SITE_NOT_FOUND", 404);
    }

    if (data.managerUserId) {
      const manager = await prisma.user.findFirst({
        where: { id: data.managerUserId, organizationId: user.organizationId },
      });
      if (!manager) {
        return jsonError("Project manager not found or outside organization scope", "USER_NOT_FOUND", 404);
      }
    }

    const existingCode = await prisma.project.findFirst({
      where: { organizationId: user.organizationId, code: data.code },
    });
    if (existingCode) {
      return jsonError(`Project with code '${data.code}' already exists`, "DUPLICATE_CODE", 409);
    }

    const managerUserId = data.managerUserId || user.userId;

    const project = await prisma.project.create({
      data: {
        organizationId: user.organizationId,
        siteId: data.siteId,
        code: data.code,
        name: data.name,
        managerUserId,
        budgetAmount: data.budgetAmount,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: data.notes,
      },
      include: {
        site: true,
        manager: { select: { id: true, name: true, email: true } },
        _count: {
          select: { tasks: true, dailyReports: true, stockMovements: true },
        },
      },
    });

    // Ensure the creator and assigned manager have active ProjectAssignment
    const assignees = new Set<string>([user.userId]);
    if (data.managerUserId) assignees.add(data.managerUserId);

    for (const uid of Array.from(assignees)) {
      await prisma.projectAssignment.upsert({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: uid,
          },
        },
        update: { status: "ACTIVE" },
        create: {
          organizationId: user.organizationId,
          projectId: project.id,
          userId: uid,
          role: uid === data.managerUserId ? "PROJECT_MANAGER" : (user.role as any),
          status: "ACTIVE",
          assignedById: user.userId,
        },
      }).catch(() => {});
    }

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PROJECT_CREATED",
        entityType: "PROJECT",
        entityId: project.id,
        afterJson: JSON.stringify({ name: project.name, code: project.code }),
      },
    });

    return jsonSuccess(project, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
