import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createReportSchema = z.object({
  projectId: z.string().min(1),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  progress: z.string().min(3),
  blockers: z.string().optional(),
  safetyNotes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const reportDate = searchParams.get("reportDate");
    const siteId = searchParams.get("siteId");

    const where: any = {
      organizationId: user.organizationId,
    };

    if (projectId) where.projectId = projectId;
    if (reportDate) where.reportDate = reportDate;
    if (siteId) {
      where.project = { siteId };
    }

    const reports = await prisma.dailySiteReport.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            site: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        creator: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
    });

    return jsonSuccess(reports);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    // Site Supervisors, Project Managers, and Admins can create daily reports
    if (!hasPermission(user.role, "tasks:write") && !hasPermission(user.role, "projects:write")) {
      return jsonError("Forbidden: Insufficient permissions to create daily site reports", "FORBIDDEN", 403);
    }

    const body = await req.json();
    const data = createReportSchema.parse(body);

    // Verify project belongs to user's organization
    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        organizationId: user.organizationId,
      },
      include: { site: true },
    });

    if (!project) {
      return jsonError("Project not found or outside organization scope", "PROJECT_NOT_FOUND", 404);
    }

    const report = await prisma.$transaction(async (tx) => {
      const created = await tx.dailySiteReport.create({
        data: {
          organizationId: user.organizationId,
          projectId: data.projectId,
          reportDate: data.reportDate,
          progress: data.progress,
          blockers: data.blockers || null,
          safetyNotes: data.safetyNotes || null,
          createdBy: user.userId,
        },
        include: {
          project: {
            select: { id: true, code: true, name: true, site: true },
          },
          creator: {
            select: { id: true, name: true, role: true },
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "DAILY_REPORT_SUBMITTED",
          entityType: "DAILY_SITE_REPORT",
          entityId: created.id,
          afterJson: JSON.stringify({
            projectId: data.projectId,
            reportDate: data.reportDate,
            siteId: project.siteId,
          }),
        },
      });

      return created;
    });

    return jsonSuccess(report, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
