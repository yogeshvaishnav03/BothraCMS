import { NextRequest } from "next/server";
import crypto from "crypto";
import { getUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { backupFileToDatabase, getStorageProvider } from "@/lib/storage";
import {
  STANDARD_ALLOWED_MIME_TYPES as ALLOWED_MIME_TYPES,
  STANDARD_EXTENSION_MAP as EXTENSION_MAP,
  FINANCIAL_CATEGORIES,
  isValidMagicBytes,
  sanitizeFileName,
} from "@/lib/upload-validation";

import {
  requireUserContext,
  requireProjectAccess,
  requireFolderAccess,
  canReadFinance,
  requireFinanceRead,
  isOrgOwnerOrAdmin,
  getUserAccessibleProjectIds,
  AuthorizationError,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit for project documents/photos

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const projectId = searchParams.get("projectId");
    const folderId = searchParams.get("folderId");
    const stockMovementId = searchParams.get("stockMovementId");
    const attendanceSessionId = searchParams.get("attendanceSessionId");
    const category = searchParams.get("category");
    const rawLimit = searchParams.get("limit");
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;

    // Check project access if specified
    if (projectId) {
      await requireProjectAccess(user, projectId);
    }

    // Check financial access if requested category is financial
    if (category && FINANCIAL_CATEGORIES.has(category.toUpperCase())) {
      if (!canReadFinance(user)) {
        throw new AuthorizationError("Finance access denied", 403, "FINANCE_ACCESS_DENIED");
      }
    }

    const where: any = {
      organizationId: user.organizationId,
      isArchived: false,
    };

    if (entityType) where.entityType = entityType.toUpperCase();
    if (entityId) where.entityId = entityId;
    if (projectId) where.projectId = projectId;
    if (folderId) where.folderId = folderId;
    if (stockMovementId) where.stockMovementId = stockMovementId;
    if (attendanceSessionId) where.attendanceSessionId = attendanceSessionId;
    if (category) {
      where.category = category.toUpperCase();
    } else if (!canReadFinance(user)) {
      // Exclude sensitive financial attachments for non-finance users
      where.category = { notIn: Array.from(FINANCIAL_CATEGORIES) };
    }

    // If no specific project queried and user not owner/admin, restrict to accessible projects or non-project items
    if (!projectId && !isOrgOwnerOrAdmin(user)) {
      const accessibleProjectIds = await getUserAccessibleProjectIds(user);
      if (accessibleProjectIds) {
        where.OR = [
          { projectId: { in: accessibleProjectIds } },
          { projectId: null },
        ];
      }
    }

    const attachments = await prisma.attachment.findMany({
      where,
      include: {
        uploadedBy: { select: { id: true, name: true, role: true } },
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });

    return jsonSuccess(
      attachments.map((a: any) => ({
        id: a.id,
        fileId: a.fileId,
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        category: a.category,
        entityType: a.entityType,
        entityId: a.entityId,
        projectId: a.projectId,
        projectName: a.project?.name,
        folderId: a.folderId,
        notes: a.notes,
        uploadedBy: a.uploadedBy.name,
        uploadedById: a.uploadedById,
        createdAt: a.createdAt,
        url: `/api/uploads/${a.fileId}`,
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const entityType = (formData.get("entityType") as string) || "GENERAL";
    const entityId = (formData.get("entityId") as string) || "";
    let projectId = (formData.get("projectId") as string) || undefined;
    const folderId = (formData.get("folderId") as string) || undefined;
    const category = (formData.get("category") as string) || "GENERAL";
    const notes = (formData.get("notes") as string) || "";
    const stockMovementId = (formData.get("stockMovementId") as string) || undefined;
    const attendanceSessionId = (formData.get("attendanceSessionId") as string) || undefined;
    const materialId = (formData.get("materialId") as string) || undefined;
    const paymentId = (formData.get("paymentId") as string) || undefined;

    // Photos uploaded on a task are linked to it so they show in the task history.
    // The person a task is assigned to (or who created it) may add photos to it
    // even when they are not on the project team.
    let taskId: string | null = null;
    let taskGrantsAccess = false;
    if (entityType.toUpperCase() === "TASK" && entityId) {
      const task = await prisma.task.findFirst({
        where: { id: entityId, organizationId: user.organizationId },
        select: { id: true, projectId: true, assigneeUserId: true, createdBy: true },
      });
      if (!task) return jsonError("Task not found", "NOT_FOUND", 404);
      taskId = task.id;
      projectId = task.projectId;
      taskGrantsAccess = task.assigneeUserId === user.userId || task.createdBy === user.userId;
    }

    // Validate project access if provided
    if (projectId && !taskGrantsAccess) {
      await requireProjectAccess(user, projectId);
    }

    // Validate folder access if uploading to a specific folder
    if (folderId) {
      await requireFolderAccess(user, folderId, "upload");
    }

    // Validate finance access if category is financial
    if (FINANCIAL_CATEGORIES.has(category.toUpperCase())) {
      requireFinanceRead(user);
    }

    if (!file) {
      return jsonError("No file provided in request", "MISSING_FILE", 400);
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return jsonError(
        `Invalid file format '${file.type}'. Supported formats: JPEG, PNG, WEBP, PDF`,
        "INVALID_FILE_TYPE",
        400
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return jsonError(
        `File size (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds limit of 10 MB`,
        "FILE_TOO_LARGE",
        400
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    if (!isValidMagicBytes(fileBuffer, file.type)) {
      return jsonError("File signature verification failed", "MIME_SPOOFING_DETECTED", 400);
    }

    const safeExt = EXTENSION_MAP[file.type] || ".bin";
    const fileId = crypto.randomUUID();
    const diskFileName = `${user.organizationId}_${fileId}${safeExt}`;
    const sanitizedOriginalName = sanitizeFileName(file.name);

    // Put file in storage backend
    const storage = getStorageProvider();
    await storage.put(diskFileName, fileBuffer, file.type);

    // A copy in the database when there is no cloud storage, so the file survives on Vercel.
    try {
      await backupFileToDatabase(user.organizationId, [`FILE_BLOB_${fileId}`, `FILE_BLOB_${diskFileName}`], fileBuffer);
    } catch (err) {
      console.warn("Notice: Blob database backup skipped in attachments POST:", err);
    }

    // Save attachment record in database
    const attachment = await prisma.attachment.create({
      data: {
        organizationId: user.organizationId,
        entityType: entityType.toUpperCase(),
        entityId: entityId || fileId,
        fileId,
        fileName: sanitizedOriginalName,
        fileSize: file.size,
        mimeType: file.type,
        category: category.toUpperCase(),
        diskFileName,
        projectId: projectId || null,
        folderId: folderId || null,
        taskId,
        stockMovementId: stockMovementId || null,
        attendanceSessionId: attendanceSessionId || null,
        materialId: materialId || null,
        paymentId: paymentId || null,
        notes: notes || null,
        uploadedById: user.userId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, role: true } },
      },
    });

    // Also write an audit event so existing /api/uploads/[id] authorization resolves smoothly
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "DOCUMENT_UPLOADED",
        entityType: entityType.toUpperCase(),
        entityId: fileId,
        reason: notes || `Attached ${category}: ${sanitizedOriginalName}`,
        afterJson: JSON.stringify({
          fileId,
          originalName: sanitizedOriginalName,
          mimeType: file.type,
          sizeBytes: file.size,
          category,
          diskFileName,
          entityType,
          entityId,
          projectId,
          folderId,
        }),
      },
    });

    return jsonSuccess(
      {
        id: attachment.id,
        fileId: attachment.fileId,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        category: attachment.category,
        entityType: attachment.entityType,
        entityId: attachment.entityId,
        projectId: attachment.projectId,
        folderId: attachment.folderId,
        notes: attachment.notes,
        uploadedBy: attachment.uploadedBy.name,
        uploadedById: attachment.uploadedById,
        createdAt: attachment.createdAt,
        url: `/api/uploads/${attachment.fileId}`,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
