import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { moveFilesToCloud, storageStatus } from "@/services/storage-move";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Settings → File storage: where photos and drawings are kept. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    return jsonSuccess(await storageStatus(user.organizationId));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Moves the next few files from the database to cloud storage. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    const result = await moveFilesToCloud(user.organizationId);
    if (result.moved) {
      await prisma.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "FILES_MOVED_TO_CLOUD",
          entityType: "ORGANIZATION",
          entityId: user.organizationId,
          afterJson: JSON.stringify(result),
        },
      });
    }
    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
