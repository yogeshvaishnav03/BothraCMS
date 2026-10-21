import crypto from "crypto";
import { prisma } from "@/lib/db";
import { notifyTaskUpdate, statusLabel } from "@/lib/task-notifications";

/**
 * Task history in the style of a commit log: every change to a task becomes
 * one entry with a short hash, its author, a message, the fields that changed
 * (before → after) and any photos that came with it.
 */

export type TimelineEntryKind = "CREATED" | "STATUS" | "EDIT" | "UPDATE" | "COMMENT" | "PHOTOS";

export interface FieldChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

export interface TaskTimelineEntry {
  id: string;
  hash: string;
  kind: TimelineEntryKind;
  at: string;
  author: { id: string; name: string; role: string | null } | null;
  message: string;
  note?: string | null;
  changes: FieldChange[];
  photos: { url: string; name?: string }[];
  commentType?: string;
}

const EDIT_FIELDS: Record<string, string> = {
  title: "Title",
  description: "Description",
  priority: "Priority",
  assigneeUserId: "Assigned to",
  dueAt: "Due date",
  taskType: "Type",
  reminderAt: "Reminder",
};

// A status change and the progress note posted with it land within moments of each other.
const SAME_UPDATE_WINDOW_MS = 1_000;
// Photos one person uploads in a short burst are shown as one entry.
const PHOTO_BURST_WINDOW_MS = 5 * 60_000;

export function shortHash(seed: string): string {
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 7);
}

export function parsePhotoUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === "string") : [];
  } catch {
    return [];
  }
}

/** Only our own upload urls may be attached to a task or report. */
export function sanitizePhotoUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return Array.from(
    new Set(urls.filter((u): u is string => typeof u === "string" && /^\/api\/uploads\/[A-Za-z0-9._-]+$/.test(u)))
  ).slice(0, 12);
}

function toText(field: string, value: unknown, names: Map<string, string>): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field === "assigneeUserId") return names.get(String(value)) || "Unknown user";
  if (field === "dueAt" || field === "reminderAt") {
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? String(value) : d.toISOString();
  }
  return String(value);
}

function safeJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export class TaskTimelineService {
  static async getTimeline(organizationId: string, taskId: string): Promise<TaskTimelineEntry[]> {
    const task = await prisma.task.findFirst({
      where: { id: taskId, organizationId },
      include: { creator: { select: { id: true, name: true, role: true } } },
    });
    if (!task) return [];

    const [allHistory, edits, comments, attachments] = await Promise.all([
      prisma.taskStatusHistory.findMany({
        where: { taskId },
        include: { user: { select: { id: true, name: true, role: true } } },
      }),
      prisma.auditEvent.findMany({
        where: { organizationId, entityType: "TASK", entityId: taskId, action: "TASK_EDITED" },
        include: { actor: { select: { id: true, name: true, role: true } } },
      }),
      prisma.taskComment.findMany({
        where: { organizationId, taskId },
        include: { user: { select: { id: true, name: true, role: true } } },
      }),
      prisma.attachment.findMany({
        where: {
          organizationId,
          isArchived: false,
          OR: [{ taskId }, { entityType: "TASK", entityId: taskId }],
        },
        include: { uploadedBy: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // The row written when a task is created ("NONE" → TODO) is shown as the CREATED entry.
    const history = allHistory.filter((h) => h.oldStatus && h.oldStatus !== "NONE");

    // Names for the "Assigned to" before/after values.
    const assigneeIds = new Set<string>();
    for (const e of edits) {
      for (const side of [safeJson(e.beforeJson), safeJson(e.afterJson)]) {
        if (typeof side.assigneeUserId === "string" && side.assigneeUserId) assigneeIds.add(side.assigneeUserId);
      }
    }
    const names = new Map<string, string>();
    if (assigneeIds.size) {
      const users = await prisma.user.findMany({
        where: { organizationId, id: { in: Array.from(assigneeIds) } },
        select: { id: true, name: true },
      });
      users.forEach((u) => names.set(u.id, u.name));
    }

    const entries: TaskTimelineEntry[] = [];

    entries.push({
      id: `created-${task.id}`,
      hash: shortHash(`created:${task.id}`),
      kind: "CREATED",
      at: task.createdAt.toISOString(),
      author: task.creator,
      message: `Created task "${task.title}"`,
      note: task.description,
      changes: [],
      photos: [],
    });

    // Fold each progress note into the status change it was posted with (the closest one in time).
    const pairedByHistory = new Map<string, (typeof comments)[number]>();
    const mergedCommentIds = new Set<string>();
    for (const c of comments) {
      if (c.type !== "PROGRESS_UPDATE") continue;
      let best: (typeof history)[number] | null = null;
      for (const h of history) {
        if (h.changedBy !== c.userId || pairedByHistory.has(h.id)) continue;
        const gap = Math.abs(c.createdAt.getTime() - h.createdAt.getTime());
        if (gap > SAME_UPDATE_WINDOW_MS) continue;
        if (!best || gap < Math.abs(c.createdAt.getTime() - best.createdAt.getTime())) best = h;
      }
      if (best) {
        pairedByHistory.set(best.id, c);
        mergedCommentIds.add(c.id);
      }
    }

    for (const h of history) {
      const paired = pairedByHistory.get(h.id);
      const photos = paired ? [...parsePhotoUrls(paired.photoUrls), ...(paired.photoUrl ? [paired.photoUrl] : [])] : [];

      entries.push({
        id: `status-${h.id}`,
        hash: shortHash(`status:${h.id}`),
        kind: "STATUS",
        at: h.createdAt.toISOString(),
        author: h.user,
        message: `Moved from ${statusLabel(h.oldStatus)} to ${statusLabel(h.newStatus)}`,
        note: paired?.content || h.note,
        changes: [{ field: "status", label: "Status", from: h.oldStatus, to: h.newStatus }],
        photos: photos.map((url) => ({ url })),
      });
    }

    for (const e of edits) {
      const before = safeJson(e.beforeJson);
      const after = safeJson(e.afterJson);
      const changes: FieldChange[] = [];
      for (const [field, label] of Object.entries(EDIT_FIELDS)) {
        const from = toText(field, before[field], names);
        const to = toText(field, after[field], names);
        if (from !== to) changes.push({ field, label, from, to });
      }
      if (changes.length === 0) continue;
      entries.push({
        id: `edit-${e.id}`,
        hash: shortHash(`edit:${e.id}`),
        kind: "EDIT",
        at: e.createdAt.toISOString(),
        author: e.actor,
        message:
          changes.length === 1 ? `Changed ${changes[0].label.toLowerCase()}` : `Changed ${changes.map((c) => c.label.toLowerCase()).join(", ")}`,
        note: e.reason && e.reason !== "Task details modified" ? e.reason : null,
        changes,
        photos: [],
      });
    }

    const photoUrlsInComments = new Set<string>();
    for (const c of comments) {
      const photos = [...parsePhotoUrls(c.photoUrls), ...(c.photoUrl ? [c.photoUrl] : [])];
      photos.forEach((u) => photoUrlsInComments.add(u));
      if (mergedCommentIds.has(c.id)) continue;
      const isUpdate = c.type === "PROGRESS_UPDATE";
      entries.push({
        id: `comment-${c.id}`,
        hash: shortHash(`comment:${c.id}`),
        kind: isUpdate ? "UPDATE" : "COMMENT",
        at: c.createdAt.toISOString(),
        author: c.user,
        message: isUpdate
          ? "Posted a progress update"
          : c.type === "QUESTION"
          ? "Asked a question"
          : c.type === "ASSISTANCE_REQUEST"
          ? "Asked for help"
          : "Commented",
        note: c.content,
        changes: [],
        photos: photos.map((url) => ({ url })),
        commentType: c.type,
      });
    }

    // Photos uploaded straight to the task (not through an update) grouped per person per burst.
    let burst: TaskTimelineEntry | null = null;
    let burstEnd = 0;
    for (const a of attachments) {
      const url = `/api/uploads/${a.fileId}`;
      if (photoUrlsInComments.has(url)) continue;
      const t = a.createdAt.getTime();
      if (burst && burst.author?.id === a.uploadedById && t - burstEnd <= PHOTO_BURST_WINDOW_MS) {
        burst.photos.push({ url, name: a.fileName });
        burstEnd = t;
        burst.message = `Added ${burst.photos.length} files`;
        continue;
      }
      burst = {
        id: `files-${a.id}`,
        hash: shortHash(`files:${a.id}`),
        kind: "PHOTOS",
        at: a.createdAt.toISOString(),
        author: a.uploadedBy,
        message: "Added 1 file",
        note: a.notes,
        changes: [],
        photos: [{ url, name: a.fileName }],
      };
      burstEnd = t;
      entries.push(burst);
    }

    return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }

  /**
   * One progress update from the field: an optional status move, a note and
   * photos, recorded together and sent to the admins.
   */
  static async postUpdate(params: {
    organizationId: string;
    userId: string;
    userName: string;
    task: { id: string; title: string; status: string; createdBy: string; assigneeUserId: string | null };
    status?: string;
    note: string;
    photoUrls: string[];
  }) {
    const { task } = params;
    const statusChanged = !!params.status && params.status !== task.status;
    const now = new Date();

    const ops: any[] = [];
    if (statusChanged) {
      const data: any = { status: params.status };
      if (params.status === "COMPLETED") {
        data.completedAt = now;
        data.completedById = params.userId;
      } else if (params.status === "VERIFIED") {
        data.verifiedAt = now;
        data.verifiedById = params.userId;
      }
      ops.push(prisma.task.update({ where: { id: task.id }, data }));
      ops.push(
        prisma.taskStatusHistory.create({
          data: { taskId: task.id, oldStatus: task.status, newStatus: params.status!, changedBy: params.userId, createdAt: now },
        })
      );
    }
    ops.push(
      prisma.taskComment.create({
        data: {
          organizationId: params.organizationId,
          taskId: task.id,
          userId: params.userId,
          content: params.note.trim() || (statusChanged ? `Status set to ${statusLabel(params.status)}` : "Photos added"),
          type: "PROGRESS_UPDATE",
          photoUrls: params.photoUrls.length ? JSON.stringify(params.photoUrls) : null,
          createdAt: now,
        },
      })
    );
    await prisma.$transaction(ops);

    const photoText = params.photoUrls.length ? ` (${params.photoUrls.length} photo${params.photoUrls.length > 1 ? "s" : ""})` : "";
    await notifyTaskUpdate({
      organizationId: params.organizationId,
      actorUserId: params.userId,
      task,
      title: statusChanged
        ? `${params.userName} moved "${task.title}" to ${statusLabel(params.status)}`
        : `${params.userName} updated "${task.title}"`,
      message: `${params.note.trim() || "Progress update"}${photoText}`,
      severity: params.status === "BLOCKED" ? "WARNING" : "INFO",
    });

    return { statusChanged };
  }
}
