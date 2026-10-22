import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requireProjectAccess } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { MilestoneService } from "@/services/milestone-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    await requireProjectAccess(user, params.id, "projects:read");
    return jsonSuccess(await MilestoneService.list(user.organizationId, params.id));
  } catch (error) {
    return handleApiError(error);
  }
}

const dateField = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(v) : v === null ? null : undefined))
  .refine((d) => d === undefined || d === null || !isNaN(d.getTime()), "Invalid date");

const createSchema = z.union([
  z.object({ template: z.literal("STANDARD") }),
  z.object({
    name: z.string().trim().min(2).max(200),
    description: z.string().max(2000).nullable().optional(),
    weight: z.number().positive().max(1000).optional(),
    plannedStart: dateField,
    plannedEnd: dateField,
  }),
]);

/** Add a stage, or { template: "STANDARD" } to add the usual building stages in one go. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    await requireProjectAccess(user, params.id, "projects:write");
    const project = await prisma.project.findFirst({ where: { id: params.id, organizationId: user.organizationId }, select: { id: true } });
    if (!project) return jsonError("Project not found", "NOT_FOUND", 404);

    const body = createSchema.parse(await req.json());
    if ("template" in body) {
      const added = await MilestoneService.addStandardStages(user.organizationId, params.id, user.userId);
      return jsonSuccess({ added, ...(await MilestoneService.list(user.organizationId, params.id)) }, 201);
    }
    await MilestoneService.create(user.organizationId, params.id, user.userId, body);
    return jsonSuccess(await MilestoneService.list(user.organizationId, params.id), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
