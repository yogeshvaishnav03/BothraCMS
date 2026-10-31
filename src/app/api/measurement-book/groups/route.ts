import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { MeasurementBookService } from "@/services/measurement-book-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const createGroupSchema = z.object({
  projectId: z.string().min(1),
  partyId: z.string().min(1),
  siteId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || undefined;
    const partyId = searchParams.get("partyId") || undefined;

    const where: any = { organizationId: user.organizationId };
    if (projectId) where.projectId = projectId;
    if (partyId) where.partyId = partyId;

    const groups = await prisma.measurementGroup.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
        party: { select: { id: true, name: true, partyType: true } },
        subgroups: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonSuccess(groups);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = createGroupSchema.parse(body);

    const group = await MeasurementBookService.createGroup({
      organizationId: user.organizationId,
      projectId: data.projectId,
      partyId: data.partyId,
      siteId: data.siteId,
      name: data.name,
      description: data.description,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess(group, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
