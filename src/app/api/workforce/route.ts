import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
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
  dailyWageRate: z.number().min(0).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");
    const workerType = searchParams.get("workerType");

    const where: any = { organizationId: user.organizationId, active: true };
    if (siteId) where.defaultSiteId = siteId;
    if (workerType) where.workerType = workerType;

    let workers = await prisma.workforceMember.findMany({
      where,
      include: { defaultSite: true },
      orderBy: { name: "asc" },
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
            dailyWageRate: 850,
            defaultSiteId: site.id,
            organizationId: user.organizationId,
          },
          {
            name: "Suresh Sharma",
            employeeCode: "WRK-1002",
            workerType: "CARPENTER",
            phone: "+91 98765 43211",
            dailyWageRate: 850,
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
          orderBy: { name: "asc" },
        });
      }

      // If site filter was specified but returned 0 while org has active workers, fallback to all org active workers
      if (workers.length === 0 && siteId) {
        workers = await prisma.workforceMember.findMany({
          where: { organizationId: user.organizationId, active: true },
          include: { defaultSite: true },
          orderBy: { name: "asc" },
        });
      }
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

    assertPermission(user.role, "attendance:write");

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
      },
      include: { defaultSite: true },
    });

    return jsonSuccess(worker, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "attendance:write");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Worker ID is required", "BAD_REQUEST", 400);

    const worker = await prisma.workforceMember.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!worker) {
      return jsonError("Worker not found", "NOT_FOUND", 404);
    }

    await prisma.workforceMember.delete({
      where: { id: worker.id },
    });

    return jsonSuccess({ deleted: true, id: worker.id });
  } catch (error) {
    return handleApiError(error);
  }
}
