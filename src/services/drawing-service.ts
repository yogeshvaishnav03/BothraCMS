import { prisma } from "@/lib/db";
import type { UserContext } from "@/lib/auth";
import { notifyPeople, projectTeamIds } from "@/lib/notify";
import { getUserAccessibleProjectIds, isOrgOwnerOrAdmin, userHasProjectAccess } from "@/lib/server-auth";
import { hasPermission } from "@/lib/permissions";

/**
 * Drawings register: each drawing number keeps every revision (R0, R1...).
 * Issuing a revision "Good for construction" (GFC) supersedes the earlier one,
 * and the project team is told so nobody builds from an old print.
 */

export class DrawingError extends Error {
  constructor(message: string, public statusCode = 422, public code = "DRAWING_INVALID") {
    super(message);
  }
}

export interface MarkupShape {
  type: "pen" | "arrow" | "rect" | "cloud" | "text";
  color: string;
  points: [number, number][];
  text?: string;
}

export const DISCIPLINES = ["ARCHITECTURAL", "STRUCTURAL", "ELECTRICAL", "PLUMBING", "HVAC", "LANDSCAPE", "OTHER"] as const;

const safeFileUrl = (u: string | null | undefined) => (u && /^\/api\/uploads\/[A-Za-z0-9._-]+$/.test(u) ? u : null);

function nextRevision(existing: string[]): string {
  const numbers = existing.map((r) => Number(r.replace(/^R/i, ""))).filter((n) => Number.isFinite(n));
  return `R${numbers.length ? Math.max(...numbers) + 1 : 0}`;
}

/** Admins, and project managers on the project, review and issue drawings. */
async function canReview(user: UserContext, projectId: string) {
  if (isOrgOwnerOrAdmin(user)) return true;
  return user.role === "PROJECT_MANAGER" && (await userHasProjectAccess(user, projectId));
}

async function names(ids: (string | null)[]) {
  const clean = Array.from(new Set(ids.filter(Boolean) as string[]));
  const users = clean.length ? await prisma.user.findMany({ where: { id: { in: clean } }, select: { id: true, name: true } }) : [];
  return new Map(users.map((u) => [u.id, u.name]));
}

export class DrawingService {
  static async list(user: UserContext, filters: { projectId?: string | null; discipline?: string | null; q?: string | null }) {
    const accessible = await getUserAccessibleProjectIds(user);
    const where: any = { organizationId: user.organizationId };
    if (filters.projectId) {
      if (accessible && !accessible.includes(filters.projectId)) return { drawings: [], canUpload: false, summary: null };
      where.projectId = filters.projectId;
    } else if (accessible) where.projectId = { in: accessible };
    if (filters.discipline) where.discipline = filters.discipline;
    if (filters.q) where.OR = [{ number: { contains: filters.q } }, { title: { contains: filters.q } }];

    const rows = await prisma.drawing.findMany({
      where,
      include: { project: { select: { id: true, name: true, code: true } }, revisions: { orderBy: { createdAt: "desc" } } },
      orderBy: [{ discipline: "asc" }, { number: "asc" }],
    });
    const people = await names(rows.flatMap((d) => d.revisions.flatMap((r) => [r.uploadedBy, r.reviewedBy])));
    const canReviewAny = isOrgOwnerOrAdmin(user) || user.role === "PROJECT_MANAGER";

    const drawings = rows.map((d) => {
      const revisions = d.revisions.map((r) => ({
        ...r,
        uploadedByName: people.get(r.uploadedBy) || null,
        reviewedByName: r.reviewedBy ? people.get(r.reviewedBy) || null : null,
      }));
      const onSite = revisions.find((r) => r.status === "GFC") || null;
      const latest = revisions[0] || null;
      return {
        id: d.id,
        number: d.number,
        title: d.title,
        discipline: d.discipline,
        project: d.project,
        latest,
        onSite,
        // Site is working from an older sheet than the latest approved one.
        pendingReview: revisions.filter((r) => r.status === "FOR_APPROVAL").length,
        revisions,
        updatedAt: d.updatedAt,
      };
    });
    return {
      drawings,
      canUpload: hasPermission(user.role, "projects:write"),
      canReview: canReviewAny,
      summary: {
        total: drawings.length,
        gfc: drawings.filter((d) => d.onSite).length,
        waiting: drawings.reduce((s, d) => s + d.pendingReview, 0),
        noGfc: drawings.filter((d) => !d.onSite).length,
      },
    };
  }

  static async create(
    user: UserContext,
    input: { projectId: string; number: string; title: string; discipline: string; fileUrl?: string | null; fileName?: string | null; notes?: string | null }
  ) {
    if (!(await userHasProjectAccess(user, input.projectId))) throw new DrawingError("You are not on this project's team.", 403, "PROJECT_ACCESS_DENIED");
    const number = input.number.trim().toUpperCase();
    const clash = await prisma.drawing.findUnique({ where: { projectId_number: { projectId: input.projectId, number } } });
    if (clash) throw new DrawingError(`Drawing ${number} already exists. Upload a new revision on it instead.`, 409, "DRAWING_EXISTS");
    const drawing = await prisma.drawing.create({
      data: {
        organizationId: user.organizationId,
        projectId: input.projectId,
        number,
        title: input.title.trim(),
        discipline: input.discipline,
        createdBy: user.userId,
        revisions: {
          create: { revision: "R0", fileUrl: safeFileUrl(input.fileUrl), fileName: input.fileName || null, notes: input.notes || null, uploadedBy: user.userId },
        },
      },
    });
    await this.audit(user, "DRAWING_CREATED", drawing.id, { number, revision: "R0" });
    return drawing;
  }

  static async addRevision(user: UserContext, drawingId: string, input: { fileUrl?: string | null; fileName?: string | null; notes?: string | null }) {
    const drawing = await prisma.drawing.findFirst({ where: { id: drawingId, organizationId: user.organizationId }, include: { revisions: true } });
    if (!drawing) throw new DrawingError("Drawing not found", 404, "NOT_FOUND");
    if (!(await userHasProjectAccess(user, drawing.projectId))) throw new DrawingError("You are not on this project's team.", 403, "PROJECT_ACCESS_DENIED");
    const revision = nextRevision(drawing.revisions.map((r) => r.revision));
    await prisma.$transaction([
      prisma.drawingRevision.create({
        data: { drawingId, revision, fileUrl: safeFileUrl(input.fileUrl), fileName: input.fileName || null, notes: input.notes || null, uploadedBy: user.userId },
      }),
      prisma.drawing.update({ where: { id: drawingId }, data: { updatedAt: new Date() } }),
    ]);
    await this.audit(user, "DRAWING_REVISED", drawingId, { number: drawing.number, revision });
    return revision;
  }

  /** APPROVE, ISSUE (good for construction) or REJECT a revision. */
  static async review(user: UserContext, revisionId: string, action: "APPROVE" | "ISSUE" | "REJECT", note?: string | null) {
    const rev = await prisma.drawingRevision.findFirst({
      where: { id: revisionId, drawing: { organizationId: user.organizationId } },
      include: { drawing: { include: { project: { select: { name: true } } } } },
    });
    if (!rev) throw new DrawingError("Revision not found", 404, "NOT_FOUND");
    if (!(await canReview(user, rev.drawing.projectId))) throw new DrawingError("Only an admin or the project manager can approve drawings.", 403, "FORBIDDEN");
    if (rev.status === "SUPERSEDED") throw new DrawingError("This revision has been replaced by a newer one.", 409, "REVISION_SUPERSEDED");
    if (action === "REJECT" && !note?.trim()) throw new DrawingError("Say what needs to change.");

    const status = action === "APPROVE" ? "APPROVED" : action === "ISSUE" ? "GFC" : "REJECTED";
    const ops: any[] = [
      prisma.drawingRevision.update({
        where: { id: rev.id },
        data: { status, reviewedBy: user.userId, reviewedAt: new Date(), notes: note?.trim() ? note.trim() : rev.notes },
      }),
    ];
    if (status === "GFC") {
      ops.push(
        prisma.drawingRevision.updateMany({
          where: { drawingId: rev.drawingId, id: { not: rev.id }, status: { in: ["GFC", "APPROVED", "FOR_APPROVAL"] } },
          data: { status: "SUPERSEDED" },
        })
      );
    }
    await prisma.$transaction(ops);
    await this.audit(user, `DRAWING_${status}`, rev.drawingId, { number: rev.drawing.number, revision: rev.revision });

    const label = `${rev.drawing.number} ${rev.revision}`;
    if (status === "GFC") {
      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: await projectTeamIds(rev.drawing.projectId),
        type: "DRAWING_ISSUED",
        title: `New drawing for construction: ${label}`,
        message: `${rev.drawing.title} (${rev.drawing.project.name}). Use ${rev.revision} from now on; older prints are superseded.`,
        href: `/drawings?id=${rev.drawingId}`,
        entityType: "DRAWING",
        entityId: rev.drawingId,
        severity: "WARNING",
      });
    } else {
      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: [rev.uploadedBy],
        type: "DRAWING_ISSUED",
        title: `${label} ${status === "APPROVED" ? "approved" : "sent back"}`,
        message: note?.trim() || rev.drawing.title,
        href: `/drawings?id=${rev.drawingId}`,
        entityType: "DRAWING",
        entityId: rev.drawingId,
      });
    }
  }

  /** One revision with its file, the drawing's other revisions (to compare) and everyone's marks. */
  static async revisionDetail(user: UserContext, revisionId: string) {
    const rev = await prisma.drawingRevision.findFirst({
      where: { id: revisionId, drawing: { organizationId: user.organizationId } },
      include: { drawing: { include: { project: { select: { id: true, name: true } }, revisions: { orderBy: { createdAt: "asc" }, select: { id: true, revision: true, status: true, fileUrl: true, fileName: true, createdAt: true } } } }, markups: true },
    });
    if (!rev) throw new DrawingError("Revision not found", 404, "NOT_FOUND");
    if (!(await userHasProjectAccess(user, rev.drawing.projectId))) throw new DrawingError("You are not on this project's team.", 403, "PROJECT_ACCESS_DENIED");
    const people = await names([rev.uploadedBy, ...rev.markups.map((m) => m.createdBy)]);
    return {
      id: rev.id,
      revision: rev.revision,
      status: rev.status,
      fileUrl: rev.fileUrl,
      fileName: rev.fileName,
      notes: rev.notes,
      uploadedByName: people.get(rev.uploadedBy) || null,
      createdAt: rev.createdAt,
      drawing: { id: rev.drawing.id, number: rev.drawing.number, title: rev.drawing.title, discipline: rev.drawing.discipline, project: rev.drawing.project },
      revisions: rev.drawing.revisions,
      markups: rev.markups.map((m) => ({ id: m.id, page: m.page, shapes: JSON.parse(m.shapesJson), createdBy: m.createdBy, createdByName: people.get(m.createdBy) || "Someone", mine: m.createdBy === user.userId, updatedAt: m.updatedAt })),
      canMark: true,
    };
  }

  /** Saves this person's marks on one page (replacing their earlier ones). No marks removes them. */
  static async saveMarkup(user: UserContext, revisionId: string, page: number, shapes: MarkupShape[]) {
    const rev = await prisma.drawingRevision.findFirst({ where: { id: revisionId, drawing: { organizationId: user.organizationId } }, include: { drawing: true } });
    if (!rev) throw new DrawingError("Revision not found", 404, "NOT_FOUND");
    if (!(await userHasProjectAccess(user, rev.drawing.projectId))) throw new DrawingError("You are not on this project's team.", 403, "PROJECT_ACCESS_DENIED");
    const key = { revisionId_page_createdBy: { revisionId, page, createdBy: user.userId } };
    if (shapes.length === 0) {
      await prisma.drawingMarkup.deleteMany({ where: { revisionId, page, createdBy: user.userId } });
      return null;
    }
    const before = await prisma.drawingMarkup.findUnique({ where: key });
    const row = await prisma.drawingMarkup.upsert({
      where: key,
      create: { organizationId: user.organizationId, revisionId, page, createdBy: user.userId, shapesJson: JSON.stringify(shapes) },
      update: { shapesJson: JSON.stringify(shapes) },
    });
    await this.audit(user, "DRAWING_MARKED_UP", rev.drawingId, { number: rev.drawing.number, revision: rev.revision, page, shapes: shapes.length });
    // The first marks on a sheet go to whoever uploaded it and the drawing's owner.
    if (!before) {
      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: [rev.uploadedBy, rev.drawing.createdBy],
        type: "DRAWING_ISSUED",
        title: `${user.name || "Someone"} marked up ${rev.drawing.number} ${rev.revision}`,
        message: shapes.find((s) => s.type === "text")?.text || `${shapes.length} mark${shapes.length === 1 ? "" : "s"} on page ${page}`,
        href: `/drawings/view/${rev.id}`,
        entityType: "DRAWING",
        entityId: rev.drawingId,
      });
    }
    return row;
  }

  private static audit(user: UserContext, action: string, entityId: string, after: unknown) {
    return prisma.auditEvent.create({
      data: { organizationId: user.organizationId, actorUserId: user.userId, action, entityType: "DRAWING", entityId, afterJson: JSON.stringify(after) },
    });
  }
}
