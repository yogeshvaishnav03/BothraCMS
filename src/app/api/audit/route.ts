import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { resolveAuditEntities } from "@/lib/audit-resolver";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user, "audit:read");

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 500);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");

    const where: any = { organizationId: user.organizationId };
    if (entityType) where.entityType = entityType.toUpperCase();
    if (entityId) where.entityId = entityId;

    const rawAuditEvents = await prisma.auditEvent.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const { events, nameMap } = await resolveAuditEntities(user.organizationId, rawAuditEvents);

    return jsonSuccess({
      events,
      nameMap,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
