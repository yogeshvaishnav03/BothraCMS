import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

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

    try {
      const where: any = { organizationId: user.organizationId, active: true };
      if (siteId) where.defaultSiteId = siteId;
      if (workerType) where.workerType = workerType;

      const workers = await prisma.workforceMember.findMany({
        where,
        include: { defaultSite: true },
        orderBy: { name: "asc" },
      });

      return jsonSuccess(workers);
    } catch {
      return jsonSuccess(dynamicStore.getWorkforce({ siteId, workerType }));
    }
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

    try {
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
    } catch (dbErr) {
      console.warn("[WORKFORCE] Database write failed, saving to dynamicStore:", dbErr);
      const newWorker = dynamicStore.addWorkforce(data);
      return jsonSuccess(newWorker, 201);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
