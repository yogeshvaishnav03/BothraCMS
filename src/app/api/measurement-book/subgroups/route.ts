import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { MeasurementBookService } from "@/services/measurement-book-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const createSubgroupSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId") || undefined;

    const where: any = { organizationId: user.organizationId };
    if (groupId) where.groupId = groupId;

    const subgroups = await prisma.measurementSubgroup.findMany({
      where,
      include: {
        group: {
          select: {
            id: true,
            name: true,
            project: { select: { id: true, name: true } },
            party: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return jsonSuccess(subgroups);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = createSubgroupSchema.parse(body);

    const subgroup = await MeasurementBookService.createSubgroup({
      organizationId: user.organizationId,
      groupId: data.groupId,
      name: data.name,
      type: data.type,
      description: data.description,
      remarks: data.remarks,
      userId: user.userId,
      role: user.role,
    });

    return jsonSuccess(subgroup, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
