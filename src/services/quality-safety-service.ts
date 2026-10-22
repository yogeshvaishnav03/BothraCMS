import { prisma } from "@/lib/db";
import type { UserContext } from "@/lib/auth";
import { notifyPeople } from "@/lib/notify";
import { getUserAccessibleProjectIds, isOrgOwnerOrAdmin, userHasProjectAccess } from "@/lib/server-auth";
import { istDateKey } from "@/lib/ist-date";
import { parsePhotoUrls, sanitizePhotoUrls } from "@/services/task-timeline-service";

/**
 * Quality checklists and safety on site. A failed checklist item opens a
 * non-conformance (NCR) for the project manager to fix; safety incidents,
 * near misses and unsafe acts are reported straight away and alert admins.
 */

export class QualityError extends Error {
  constructor(message: string, public statusCode = 422, public code = "QUALITY_INVALID") {
    super(message);
  }
}

export const CHECKLISTS: Record<string, { name: string; kind: "QUALITY" | "SAFETY"; items: string[] }> = {
  PRE_POUR: {
    name: "Pre-concreting check (slab / beam)",
    kind: "QUALITY",
    items: [
      "Shuttering levels and props checked",
      "Shuttering joints sealed, oil applied",
      "Rebar size, spacing and laps as per drawing",
      "Cover blocks fixed (slab 20 mm, beam 25 mm)",
      "Electrical and plumbing sleeves in place",
      "Cube moulds and slump cone ready",
      "Vibrator and standby available",
    ],
  },
  BRICKWORK: {
    name: "Brickwork / blockwork check",
    kind: "QUALITY",
    items: [
      "Bricks soaked before use",
      "Mortar ratio as specified",
      "Wall in plumb and line",
      "Joints 10 mm, fully filled",
      "Lintel and sill levels correct",
      "Curing being done",
    ],
  },
  PLASTER: {
    name: "Plaster check",
    kind: "QUALITY",
    items: ["Surface hacked and cleaned", "Chicken mesh at RCC-brick joints", "Thickness within 12–15 mm", "Line and level checked with straight edge", "No cracks or hollow sound", "Curing for 7 days"],
  },
  WATERPROOFING: {
    name: "Waterproofing check",
    kind: "QUALITY",
    items: ["Surface clean and dry", "Coving at wall junctions", "Coats as per specification", "Pond test for 48 hours passed", "Protection screed laid"],
  },
  SAFETY_WALK: {
    name: "Weekly site safety walk",
    kind: "SAFETY",
    items: [
      "Everyone wearing helmet and shoes",
      "Harness used for work at height",
      "Edge protection and guard rails in place",
      "Scaffolding tagged and stable",
      "Electrical cables and DBs safe",
      "Fire extinguisher and first aid box available",
      "Housekeeping and walkways clear",
    ],
  },
};

export const ISSUE_KINDS = ["NCR", "SAFETY_INCIDENT", "NEAR_MISS", "UNSAFE_ACT", "OBSERVATION"] as const;
export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const prefixFor = (kind: string) => (kind === "NCR" ? "NCR" : kind === "OBSERVATION" ? "OBS" : "SAF");
const isSafetyKind = (kind: string) => kind === "SAFETY_INCIDENT" || kind === "NEAR_MISS" || kind === "UNSAFE_ACT";

async function nextIssueNumber(tx: any, organizationId: string, kind: string): Promise<string> {
  const prefix = `${prefixFor(kind)}-${istDateKey().slice(2, 7).replace("-", "")}-`;
  const count = await tx.siteIssue.count({ where: { organizationId, issueNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

async function names(ids: (string | null | undefined)[]) {
  const clean = Array.from(new Set(ids.filter(Boolean) as string[]));
  const users = clean.length ? await prisma.user.findMany({ where: { id: { in: clean } }, select: { id: true, name: true, phone: true } }) : [];
  return new Map(users.map((u) => [u.id, u]));
}

async function scopedProjects(user: UserContext, projectId?: string | null) {
  const accessible = await getUserAccessibleProjectIds(user);
  if (projectId) {
    if (accessible && !accessible.includes(projectId)) return [] as string[];
    return [projectId];
  }
  return accessible; // null = all
}

async function requireOnProject(user: UserContext, projectId: string) {
  if (!(await userHasProjectAccess(user, projectId))) throw new QualityError("You are not on this project's team.", 403, "PROJECT_ACCESS_DENIED");
}

export class QualitySafetyService {
  static async createInspection(
    user: UserContext,
    input: {
      projectId: string;
      template: string;
      title?: string | null;
      location?: string | null;
      milestoneId?: string | null;
      items: { label: string; result: "PASS" | "FAIL" | "NA"; note?: string | null }[];
      photoUrls?: string[];
    }
  ) {
    await requireOnProject(user, input.projectId);
    const template = CHECKLISTS[input.template];
    if (!template && input.template !== "CUSTOM") throw new QualityError("Unknown checklist");
    if (input.items.length === 0) throw new QualityError("Add at least one check.");
    const project = await prisma.project.findFirst({ where: { id: input.projectId, organizationId: user.organizationId }, select: { id: true, name: true, managerUserId: true } });
    if (!project) throw new QualityError("Project not found", 404, "NOT_FOUND");

    const failed = input.items.filter((i) => i.result === "FAIL");
    const result = failed.length ? "FAILED" : "PASSED";
    const title = input.title?.trim() || template?.name || "Site inspection";
    const safety = template?.kind === "SAFETY";
    const dueDate = new Date(Date.now() + 3 * 86_400_000);

    const { inspection, issues } = await prisma.$transaction(async (tx) => {
      const inspection = await tx.qualityInspection.create({
        data: {
          organizationId: user.organizationId,
          projectId: project.id,
          milestoneId: input.milestoneId || null,
          template: input.template,
          title,
          location: input.location || null,
          itemsJson: JSON.stringify(input.items.map((i) => ({ label: i.label, result: i.result, note: i.note || null }))),
          result,
          photoUrls: JSON.stringify(sanitizePhotoUrls(input.photoUrls)),
          inspectedBy: user.userId,
        },
      });
      const issues = [];
      for (const item of failed) {
        const kind = safety ? "UNSAFE_ACT" : "NCR";
        issues.push(
          await tx.siteIssue.create({
            data: {
              organizationId: user.organizationId,
              projectId: project.id,
              issueNumber: await nextIssueNumber(tx, user.organizationId, kind),
              kind,
              severity: "MEDIUM",
              title: item.note?.trim() || `Not OK: ${item.label}`,
              description: `Failed checklist point "${item.label}" in ${title}`,
              location: input.location || null,
              inspectionId: inspection.id,
              assignedTo: project.managerUserId,
              dueDate,
              reportedBy: user.userId,
            },
          })
        );
      }
      return { inspection, issues };
    });

    if (failed.length) {
      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: [project.managerUserId],
        includeAdmins: true,
        type: "QUALITY_ALERT",
        title: `${title} failed: ${failed.length} point${failed.length > 1 ? "s" : ""} to fix`,
        message: `${project.name}${input.location ? `, ${input.location}` : ""}: ${failed.map((f) => f.label).join("; ")}`,
        href: `/quality?tab=issues&projectId=${project.id}`,
        entityType: "QUALITY_INSPECTION",
        entityId: inspection.id,
        severity: "WARNING",
      });
    }
    return { inspection, issuesOpened: issues.length };
  }

  static async listInspections(user: UserContext, projectId?: string | null) {
    const scope = await scopedProjects(user, projectId);
    if (scope && scope.length === 0) return [];
    const rows = await prisma.qualityInspection.findMany({
      where: { organizationId: user.organizationId, ...(scope ? { projectId: { in: scope } } : {}) },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const people = await names(rows.map((r) => r.inspectedBy));
    return rows.map((r) => {
      const items = JSON.parse(r.itemsJson) as { label: string; result: string; note: string | null }[];
      return {
        ...r,
        items,
        passed: items.filter((i) => i.result === "PASS").length,
        failed: items.filter((i) => i.result === "FAIL").length,
        photoUrls: parsePhotoUrls(r.photoUrls),
        inspectedByName: people.get(r.inspectedBy)?.name || null,
      };
    });
  }

  static async reportIssue(
    user: UserContext,
    input: {
      projectId: string;
      kind: (typeof ISSUE_KINDS)[number];
      severity: (typeof SEVERITIES)[number];
      title: string;
      description?: string | null;
      location?: string | null;
      photoUrls?: string[];
      injuredCount?: number;
      assignedTo?: string | null;
      dueDate?: string | null;
    }
  ) {
    await requireOnProject(user, input.projectId);
    const project = await prisma.project.findFirst({ where: { id: input.projectId, organizationId: user.organizationId }, select: { id: true, name: true, managerUserId: true } });
    if (!project) throw new QualityError("Project not found", 404, "NOT_FOUND");
    if (input.assignedTo) {
      const assignee = await prisma.user.findFirst({ where: { id: input.assignedTo, organizationId: user.organizationId, status: "ACTIVE" } });
      if (!assignee) throw new QualityError("The person to fix this was not found.");
    }
    const issue = await prisma.$transaction(async (tx) =>
      tx.siteIssue.create({
        data: {
          organizationId: user.organizationId,
          projectId: project.id,
          issueNumber: await nextIssueNumber(tx, user.organizationId, input.kind),
          kind: input.kind,
          severity: input.severity,
          title: input.title.trim(),
          description: input.description || null,
          location: input.location || null,
          photoUrls: JSON.stringify(sanitizePhotoUrls(input.photoUrls)),
          injuredCount: input.kind === "SAFETY_INCIDENT" ? Math.max(0, input.injuredCount || 0) : 0,
          assignedTo: input.assignedTo || project.managerUserId,
          dueDate: input.dueDate ? new Date(`${input.dueDate}T18:00:00+05:30`) : null,
          reportedBy: user.userId,
        },
      })
    );
    const serious = input.kind === "SAFETY_INCIDENT" || input.severity === "HIGH" || input.severity === "CRITICAL";
    await notifyPeople({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      userIds: [project.managerUserId, issue.assignedTo],
      includeAdmins: serious || isSafetyKind(input.kind),
      type: isSafetyKind(input.kind) ? "SAFETY_ALERT" : "QUALITY_ALERT",
      title: `${issue.issueNumber}: ${label(input.kind)}${input.injuredCount ? `, ${input.injuredCount} injured` : ""}`,
      message: `${project.name}${input.location ? `, ${input.location}` : ""}: ${issue.title}`,
      href: `/quality?tab=issues&id=${issue.id}`,
      entityType: "SITE_ISSUE",
      entityId: issue.id,
      severity: input.kind === "SAFETY_INCIDENT" || input.severity === "CRITICAL" ? "CRITICAL" : serious ? "WARNING" : "INFO",
    });
    await prisma.auditEvent.create({
      data: { organizationId: user.organizationId, actorUserId: user.userId, action: "SITE_ISSUE_REPORTED", entityType: "SITE_ISSUE", entityId: issue.id, afterJson: JSON.stringify({ number: issue.issueNumber, kind: issue.kind, severity: issue.severity }) },
    });
    return issue;
  }

  static async listIssues(user: UserContext, filters: { projectId?: string | null; status?: string | null; kind?: string | null }) {
    const scope = await scopedProjects(user, filters.projectId);
    if (scope && scope.length === 0) return { issues: [], summary: emptySummary() };
    const base: any = { organizationId: user.organizationId, ...(scope ? { projectId: { in: scope } } : {}) };
    const where: any = { ...base };
    if (filters.status === "OPEN") where.status = "OPEN";
    else if (filters.status === "DONE") where.status = { in: ["RESOLVED", "CLOSED"] };
    if (filters.kind === "QUALITY") where.kind = { in: ["NCR", "OBSERVATION"] };
    else if (filters.kind === "SAFETY") where.kind = { in: ["SAFETY_INCIDENT", "NEAR_MISS", "UNSAFE_ACT"] };

    const [rows, all, lastIncident, inspections] = await Promise.all([
      prisma.siteIssue.findMany({ where, include: { project: { select: { id: true, name: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
      prisma.siteIssue.findMany({ where: base, select: { kind: true, status: true, dueDate: true, severity: true } }),
      prisma.siteIssue.findFirst({ where: { ...base, kind: "SAFETY_INCIDENT" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.qualityInspection.findMany({
        where: { organizationId: user.organizationId, ...(scope ? { projectId: { in: scope } } : {}), createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        select: { result: true },
      }),
    ]);
    const people = await names(rows.flatMap((r) => [r.reportedBy, r.assignedTo, r.resolvedBy]));
    const now = Date.now();
    const issues = rows.map((r) => ({
      ...r,
      photoUrls: parsePhotoUrls(r.photoUrls),
      resolutionPhotoUrls: parsePhotoUrls(r.resolutionPhotoUrls),
      reportedByName: people.get(r.reportedBy)?.name || null,
      assignee: r.assignedTo ? people.get(r.assignedTo) || null : null,
      resolvedByName: r.resolvedBy ? people.get(r.resolvedBy)?.name || null : null,
      overdue: r.status === "OPEN" && !!r.dueDate && r.dueDate.getTime() < now,
      canResolve: r.status === "OPEN",
    }));
    const open = all.filter((i) => i.status === "OPEN");
    return {
      issues,
      summary: {
        openQuality: open.filter((i) => !isSafetyKind(i.kind)).length,
        openSafety: open.filter((i) => isSafetyKind(i.kind)).length,
        overdue: open.filter((i) => i.dueDate && i.dueDate.getTime() < now).length,
        daysSinceIncident: lastIncident ? Math.floor((now - lastIncident.createdAt.getTime()) / 86_400_000) : null,
        inspections30d: inspections.length,
        passRate30d: inspections.length ? Math.round((inspections.filter((i) => i.result === "PASSED").length / inspections.length) * 100) : null,
      },
    };
  }

  /** The person fixing it (or a manager) records what was done. */
  static async resolve(user: UserContext, issueId: string, input: { resolution: string; photoUrls?: string[] }) {
    const issue = await prisma.siteIssue.findFirst({ where: { id: issueId, organizationId: user.organizationId }, include: { project: { select: { name: true } } } });
    if (!issue) throw new QualityError("Issue not found", 404, "NOT_FOUND");
    if (issue.status !== "OPEN") throw new QualityError("This issue is already closed.", 409, "ISSUE_CLOSED");
    if (issue.assignedTo !== user.userId) await requireOnProject(user, issue.projectId);
    await prisma.siteIssue.update({
      where: { id: issue.id },
      data: {
        status: "RESOLVED",
        resolution: input.resolution.trim(),
        resolutionPhotoUrls: JSON.stringify(sanitizePhotoUrls(input.photoUrls)),
        resolvedBy: user.userId,
        resolvedAt: new Date(),
      },
    });
    await notifyPeople({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      userIds: [issue.reportedBy],
      includeAdmins: isSafetyKind(issue.kind),
      type: isSafetyKind(issue.kind) ? "SAFETY_ALERT" : "QUALITY_ALERT",
      title: `${issue.issueNumber} fixed`,
      message: `${issue.title}: ${input.resolution.trim()}`,
      href: `/quality?tab=issues&id=${issue.id}`,
      entityType: "SITE_ISSUE",
      entityId: issue.id,
    });
    await prisma.auditEvent.create({
      data: { organizationId: user.organizationId, actorUserId: user.userId, action: "SITE_ISSUE_RESOLVED", entityType: "SITE_ISSUE", entityId: issue.id, afterJson: JSON.stringify({ resolution: input.resolution.trim() }) },
    });
  }

  /** A manager accepts the fix (CLOSE) or sends it back (REOPEN). */
  static async verify(user: UserContext, issueId: string, action: "CLOSE" | "REOPEN", note?: string | null) {
    const issue = await prisma.siteIssue.findFirst({ where: { id: issueId, organizationId: user.organizationId } });
    if (!issue) throw new QualityError("Issue not found", 404, "NOT_FOUND");
    const manager = isOrgOwnerOrAdmin(user) || (user.role === "PROJECT_MANAGER" && (await userHasProjectAccess(user, issue.projectId)));
    if (!manager) throw new QualityError("Only an admin or the project manager can close or reopen issues.", 403, "FORBIDDEN");
    if (issue.status === "OPEN" && action === "REOPEN") throw new QualityError("This issue is already open.", 409, "ISSUE_OPEN");
    if (issue.status === "CLOSED" && action === "CLOSE") throw new QualityError("This issue is already closed.", 409, "ISSUE_CLOSED");
    await prisma.siteIssue.update({
      where: { id: issue.id },
      data:
        action === "CLOSE"
          ? { status: "CLOSED", ...(issue.status === "OPEN" ? { resolvedBy: user.userId, resolvedAt: new Date(), resolution: note || "Closed by manager" } : {}) }
          : { status: "OPEN", resolution: note ? `Reopened: ${note}` : issue.resolution, resolvedAt: null },
    });
    if (action === "REOPEN") {
      await notifyPeople({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        userIds: [issue.assignedTo, issue.resolvedBy],
        type: "QUALITY_ALERT",
        title: `${issue.issueNumber} reopened`,
        message: note || issue.title,
        href: `/quality?tab=issues&id=${issue.id}`,
        entityType: "SITE_ISSUE",
        entityId: issue.id,
        severity: "WARNING",
      });
    }
    await prisma.auditEvent.create({
      data: { organizationId: user.organizationId, actorUserId: user.userId, action: `SITE_ISSUE_${action === "CLOSE" ? "CLOSED" : "REOPENED"}`, entityType: "SITE_ISSUE", entityId: issue.id, afterJson: JSON.stringify({ note: note || null }) },
    });
  }
}

function label(kind: string) {
  return { NCR: "Quality defect", SAFETY_INCIDENT: "Safety incident", NEAR_MISS: "Near miss", UNSAFE_ACT: "Unsafe act", OBSERVATION: "Observation" }[kind] || kind;
}

function emptySummary() {
  return { openQuality: 0, openSafety: 0, overdue: 0, daysSinceIncident: null, inspections30d: 0, passRate30d: null };
}
