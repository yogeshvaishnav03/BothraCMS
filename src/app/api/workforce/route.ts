import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission, hasPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createWorkerSchema = z.object({
  employeeCode: z.string().min(2),
  name: z.string().min(2),
  workerType: z.enum([
    "MASON",
    "CARPENTER",
    "ELECTRICIAN",
    "PLUMBER",
    "HELPER",
    "FOREMAN",
    "SITE_ENGINEER",
  ]),
  phone: z.string().optional(),
  defaultSiteId: z.string().min(1).optional(),
  dailyWageRate: z.number().min(0).optional(), // paise (Skilled Workers / Primary Rate)
  maleHelperWageRate: z.number().min(0).optional(), // paise (Laborers & Helpers Male)
  femaleHelperWageRate: z.number().min(0).optional(), // paise (Laborers & Helpers Female)
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");
    const workerType = searchParams.get("workerType");

    const where: any = { organizationId: user.organizationId, active: true, isArchived: false };
    if (siteId) where.defaultSiteId = siteId;
    if (workerType) where.workerType = workerType;

    let workers = await prisma.workforceMember.findMany({
      where,
      include: { defaultSite: true },
      orderBy: { createdAt: "desc" },
    });

    if (workers.length === 0) {
      const totalOrgWorkers = await prisma.workforceMember.count({
        where: { organizationId: user.organizationId, active: true },
      });

      if (totalOrgWorkers === 0) {
        let site = await prisma.site.findFirst({
          where: { organizationId: user.organizationId, status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
        });

        if (!site) {
          site = await prisma.site.create({
            data: {
              organizationId: user.organizationId,
              name: "Main Construction Site",
              code: "SITE-01",
              address: "Central Project Yard",
            },
          });
        }

        const initialWorkers = [
          {
            name: "Ramesh Kumar",
            employeeCode: "WRK-1001",
            workerType: "MASON",
            phone: "+91 98765 43210",
            dailyWageRate: 85000,
            defaultSiteId: site.id,
            organizationId: user.organizationId,
          },
          {
            name: "Suresh Sharma",
            employeeCode: "WRK-1002",
            workerType: "CARPENTER",
            phone: "+91 98765 43211",
            dailyWageRate: 85000,
            defaultSiteId: site.id,
            organizationId: user.organizationId,
          },
          {
            name: "Mohd. Aslam",
            employeeCode: "WRK-1003",
            workerType: "ELECTRICIAN",
            phone: "+91 98765 43212",
            dailyWageRate: 900,
            defaultSiteId: site.id,
            organizationId: user.organizationId,
          },
          {
            name: "Dinesh Yadav",
            employeeCode: "WRK-1004",
            workerType: "HELPER",
            phone: "+91 98765 43213",
            dailyWageRate: 550,
            defaultSiteId: site.id,
            organizationId: user.organizationId,
          },
        ];

        for (const w of initialWorkers) {
          await prisma.workforceMember.create({ data: w });
        }

        workers = await prisma.workforceMember.findMany({
          where,
          include: { defaultSite: true },
          orderBy: { createdAt: "desc" },
        });
      }

      // If site filter was specified but returned 0 while org has active workers, fallback to all org active workers
      if (workers.length === 0 && siteId) {
        workers = await prisma.workforceMember.findMany({
          where: { organizationId: user.organizationId, active: true },
          include: { defaultSite: true },
          orderBy: { createdAt: "desc" },
        });
      }
    }

    if (workers.some((w) => w.employeeCode.startsWith("USR-"))) {
      const orgUsers = await prisma.user.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true },
      });
      const userByCode = new Map(orgUsers.map((u) => [`USR-${u.id.slice(-6).toUpperCase()}`, u.name]));
      workers = workers.map((w) => {
        const canonicalName = userByCode.get(w.employeeCode);
        return canonicalName ? { ...w, name: canonicalName } : w;
      });
    }

    return jsonSuccess(workers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user, "attendance:write");

    const body = await req.json();
    const data = createWorkerSchema.parse(body);

    if (data.defaultSiteId) {
      const site = await prisma.site.findFirst({
        where: { id: data.defaultSiteId, organizationId: user.organizationId },
      });
      if (!site) {
        return jsonError("Assigned site not found or outside organization scope", "SITE_NOT_FOUND", 404);
      }
    }

    const existingCode = await prisma.workforceMember.findFirst({
      where: { organizationId: user.organizationId, employeeCode: data.employeeCode },
    });
    if (existingCode) {
      return jsonError(`Worker with employee code '${data.employeeCode}' already exists`, "DUPLICATE_CODE", 409);
    }

    const worker = await prisma.workforceMember.create({
      data: {
        organizationId: user.organizationId,
        employeeCode: data.employeeCode,
        name: data.name,
        workerType: data.workerType,
        phone: data.phone,
        defaultSiteId: data.defaultSiteId,
        dailyWageRate: data.dailyWageRate,
        maleHelperWageRate: data.maleHelperWageRate,
        femaleHelperWageRate: data.femaleHelperWageRate,
      },
      include: { defaultSite: true },
    });

    return jsonSuccess(worker, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

const updateWorkerSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).optional(),
  employeeCode: z.string().trim().min(2).optional(),
  workerType: z
    .enum([
      "MASON",
      "CARPENTER",
      "ELECTRICIAN",
      "PLUMBER",
      "HELPER",
      "FOREMAN",
      "SITE_ENGINEER",
    ])
    .optional(),
  phone: z.string().trim().nullable().optional(),
  defaultSiteId: z.string().min(1).nullable().optional(),
  dailyWageRate: z.number().min(0).nullable().optional(),
  maleHelperWageRate: z.number().min(0).nullable().optional(),
  femaleHelperWageRate: z.number().min(0).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user, "attendance:write");

    const body = await req.json();
    const data = updateWorkerSchema.parse(body);

    const existing = await prisma.workforceMember.findFirst({
      where: { id: data.id, organizationId: user.organizationId },
    });
    if (!existing) {
      return jsonError("Worker not found", "NOT_FOUND", 404);
    }

    if (data.defaultSiteId) {
      const site = await prisma.site.findFirst({
        where: { id: data.defaultSiteId, organizationId: user.organizationId },
      });
      if (!site) {
        return jsonError("Assigned site not found or outside organization scope", "SITE_NOT_FOUND", 404);
      }
    }

    if (data.employeeCode && data.employeeCode !== existing.employeeCode) {
      const duplicate = await prisma.workforceMember.findFirst({
        where: {
          organizationId: user.organizationId,
          employeeCode: data.employeeCode,
          id: { not: existing.id },
        },
      });
      if (duplicate) {
        return jsonError(`Worker with employee code '${data.employeeCode}' already exists`, "DUPLICATE_CODE", 409);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.employeeCode !== undefined) updateData.employeeCode = data.employeeCode;
    if (data.workerType !== undefined) updateData.workerType = data.workerType;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.defaultSiteId !== undefined) updateData.defaultSiteId = data.defaultSiteId;
    if (data.dailyWageRate !== undefined) updateData.dailyWageRate = data.dailyWageRate;
    if (data.maleHelperWageRate !== undefined) updateData.maleHelperWageRate = data.maleHelperWageRate;
    if (data.femaleHelperWageRate !== undefined) updateData.femaleHelperWageRate = data.femaleHelperWageRate;

    let linkedUserForRename: { id: string; role: string } | null = null;
    if (existing.employeeCode.startsWith("USR-") && data.name !== undefined && data.name !== existing.name) {
      if (!hasPermission(user, "users:manage")) {
        return jsonError(
          "Staff login names must be updated under Team & Access",
          "FORBIDDEN",
          403
        );
      }
      const orgUsers = await prisma.user.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, role: true },
      });
      linkedUserForRename =
        orgUsers.find((u) => `USR-${u.id.slice(-6).toUpperCase()}` === existing.employeeCode) || null;
      if (linkedUserForRename?.role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
        return jsonError("Only a Super Admin can rename a Super Admin account", "FORBIDDEN", 403);
      }
    }

    const updated = await prisma.workforceMember.update({
      where: { id: existing.id },
      data: updateData,
      include: { defaultSite: true },
    });

    if (linkedUserForRename && data.name !== undefined) {
      await Promise.all([
        prisma.user.update({
          where: { id: linkedUserForRename.id },
          data: { name: updated.name },
        }),
        prisma.workforceHeadcount.updateMany({
          where: { organizationId: user.organizationId, supervisorId: linkedUserForRename.id },
          data: { supervisorName: updated.name },
        }),
      ]).catch(() => {});
    }

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "WORKER_UPDATED",
        entityType: "WORKFORCE_MEMBER",
        entityId: existing.id,
        beforeJson: JSON.stringify({
          name: existing.name,
          employeeCode: existing.employeeCode,
          workerType: existing.workerType,
        }),
        afterJson: JSON.stringify({
          name: updated.name,
          employeeCode: updated.employeeCode,
          workerType: updated.workerType,
        }),
        reason: `Updated worker ${updated.name} (${updated.employeeCode})`,
      },
    });

    return jsonSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user, "attendance:write");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Worker ID is required", "BAD_REQUEST", 400);

    const worker = await prisma.workforceMember.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!worker) {
      return jsonError("Worker not found", "NOT_FOUND", 404);
    }

    const archived = await prisma.workforceMember.update({
      where: { id: worker.id },
      data: {
        active: false,
        isArchived: true,
        archivedAt: new Date(),
        archivedById: user.userId,
        archiveReason: "Deactivated and archived by user",
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "WORKER_ARCHIVED",
        entityType: "WORKFORCE_MEMBER",
        entityId: worker.id,
        reason: `Archived worker ${worker.name} (${worker.employeeCode})`,
      },
    });

    return jsonSuccess({ archived: true, id: worker.id });
  } catch (error) {
    return handleApiError(error);
  }
}
