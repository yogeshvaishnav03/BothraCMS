import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword, UserContext } from "@/lib/auth";
import { AuthorizationError } from "@/lib/server-auth";
import {
  ALL_PERMISSIONS,
  hasPermission,
  normalizeExtraPermissions,
  Permission,
  ROLE_PERMISSIONS,
  Role,
} from "@/lib/permissions";

/**
 * Staff accounts for one company: add people, change their role, grant extra
 * module accessibility, deactivate them and reset passwords. Every change is
 * written to the audit log.
 */

export const ASSIGNABLE_ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

const STAFF_LINKED_WORKER_TYPES = [
  "SITE_ENGINEER",
  "SITE_SUPERVISOR",
  "SUPERVISOR",
  "PROJECT_MANAGER",
  "STAFF",
  "OFFICE_STAFF",
  "ACCOUNTANT",
  "ADMIN",
  "HR_VIEWER",
  "AUDITOR",
];

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  phone: true,
  jobTitle: true,
  extraPermissionsJson: true,
  assignedSiteIdsJson: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

function formatPublicUser<T extends { extraPermissionsJson?: string | null; assignedSiteIdsJson?: string | null }>(row: T) {
  const { extraPermissionsJson, assignedSiteIdsJson, ...rest } = row as any;
  let assignedSiteIds: string[] = [];
  if (assignedSiteIdsJson) {
    try {
      const parsed = JSON.parse(assignedSiteIdsJson);
      if (Array.isArray(parsed)) assignedSiteIds = parsed.filter(Boolean);
    } catch {}
  }
  return {
    ...rest,
    extraPermissions: normalizeExtraPermissions(extraPermissionsJson),
    assignedSiteIds,
  };
}

async function validateAndSanitizeAssignedSiteIds(actor: UserContext, requested?: string[]): Promise<string[]> {
  if (!requested || requested.length === 0) return [];
  const validSites = await prisma.site.findMany({
    where: {
      organizationId: actor.organizationId,
      id: { in: requested },
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const validSiteIds = new Set(validSites.map((s) => s.id));
  return requested.filter((id) => validSiteIds.has(id));
}

async function syncUserSiteProjectAssignments(
  actor: UserContext,
  userId: string,
  userRole: string,
  assignedSiteIds: string[]
) {
  try {
    if (assignedSiteIds.length > 0) {
      const projectsOnSites = await prisma.project.findMany({
        where: {
          organizationId: actor.organizationId,
          siteId: { in: assignedSiteIds },
          isArchived: false,
        },
        select: { id: true },
      });

      for (const p of projectsOnSites) {
        await prisma.projectAssignment.upsert({
          where: {
            projectId_userId: { projectId: p.id, userId },
          },
          update: {
            status: "ACTIVE",
            role: userRole,
          },
          create: {
            organizationId: actor.organizationId,
            projectId: p.id,
            userId,
            role: userRole,
            status: "ACTIVE",
            assignedById: actor.userId,
          },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("Notice: project assignment sync skipped or partial:", err);
  }
}

function validateAndSanitizeExtraPermissions(actor: UserContext, requested: string[]): Permission[] {
  const validSet = new Set<string>(ALL_PERMISSIONS);
  const isAdmin = actor.role === "SUPER_ADMIN" || actor.role === "ORG_ADMIN";
  const cleaned = new Set<Permission>();
  for (const p of requested) {
    if (!validSet.has(p)) {
      throw new AuthorizationError(`Validation error: extraPermissions — Unknown permission '${p}'`, 422, "VALIDATION_ERROR");
    }
    if (!isAdmin && !hasPermission(actor, p as Permission)) {
      throw new AuthorizationError(`Forbidden: Cannot grant permission '${p}' that you do not hold`, 403, "FORBIDDEN");
    }
    cleaned.add(p as Permission);
  }
  return Array.from(cleaned);
}

/** Readable one-time password: 3 groups plus a digit and symbol so it passes any policy. */
export function generateTemporaryPassword(): string {
  const raw = randomBytes(9).toString("base64url").replace(/[-_]/g, "x");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}7!`;
}

function assertCanAssignRole(actor: UserContext, role: string) {
  if (!ASSIGNABLE_ROLES.includes(role as Role)) {
    throw new AuthorizationError(`Validation error: role — Unknown role ${role}`, 422, "VALIDATION_ERROR");
  }
  if (role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new AuthorizationError("Forbidden: Only a Super Admin can create or promote Super Admins", 403, "FORBIDDEN");
  }
}

async function findInOrg(actor: UserContext, userId: string) {
  const target = await prisma.user.findFirst({ where: { id: userId, organizationId: actor.organizationId } });
  if (!target) throw new AuthorizationError("NotFound: User not found", 404, "NOT_FOUND");
  if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new AuthorizationError("Forbidden: Only a Super Admin can change a Super Admin account", 403, "FORBIDDEN");
  }
  return target;
}

export class UserAdminService {
  static async list(actor: UserContext) {
    try {
      const rows = await prisma.user.findMany({
        where: { organizationId: actor.organizationId },
        select: PUBLIC_USER_SELECT,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      });
      return rows.map(formatPublicUser);
    } catch (err: any) {
      if (err?.code === "P2022" || String(err?.message || "").includes("assignedSiteIdsJson")) {
        const rows = await prisma.user.findMany({
          where: { organizationId: actor.organizationId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            phone: true,
            jobTitle: true,
            extraPermissionsJson: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        });
        return rows.map(formatPublicUser);
      }
      throw err;
    }
  }

  static async create(
    actor: UserContext,
    input: {
      name: string;
      email: string;
      role: string;
      phone?: string | null;
      jobTitle?: string | null;
      extraPermissions?: string[];
      assignedSiteIds?: string[];
    }
  ) {
    assertCanAssignRole(actor, input.role);
    const email = input.email.trim().toLowerCase();

    // Login looks people up by email alone, so an address may exist only once.
    const clash = await prisma.user.findFirst({ where: { email } });
    if (clash) {
      throw new AuthorizationError("Validation error: email — A user with this email already exists", 409, "CONFLICT");
    }

    const extraPermissions =
      input.extraPermissions !== undefined
        ? validateAndSanitizeExtraPermissions(actor, input.extraPermissions)
        : [];

    const assignedSiteIds = await validateAndSanitizeAssignedSiteIds(actor, input.assignedSiteIds);
    const temporaryPassword = generateTemporaryPassword();

    const createData: any = {
      organizationId: actor.organizationId,
      name: input.name.trim(),
      email,
      role: input.role,
      phone: input.phone?.trim() || null,
      jobTitle: input.jobTitle?.trim() || null,
      extraPermissionsJson: extraPermissions.length > 0 ? JSON.stringify(extraPermissions) : null,
      assignedSiteIdsJson: assignedSiteIds.length > 0 ? JSON.stringify(assignedSiteIds) : null,
      passwordHash: await hashPassword(temporaryPassword),
    };

    let rawUser: any;
    try {
      rawUser = await prisma.user.create({
        data: createData,
        select: PUBLIC_USER_SELECT,
      });
    } catch (err: any) {
      if (err?.code === "P2022" || String(err?.message || "").includes("assignedSiteIdsJson")) {
        delete createData.assignedSiteIdsJson;
        rawUser = await prisma.user.create({
          data: createData,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            phone: true,
            jobTitle: true,
            extraPermissionsJson: true,
            lastLoginAt: true,
            createdAt: true,
          },
        });
      } else {
        throw err;
      }
    }
    const user = formatPublicUser(rawUser);

    if (assignedSiteIds.length > 0) {
      await syncUserSiteProjectAssignments(actor, user.id, user.role, assignedSiteIds);
    }

    await prisma.auditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "USER_CREATED",
        entityType: "USER",
        entityId: user.id,
        afterJson: JSON.stringify({
          name: user.name,
          email: user.email,
          role: user.role,
          extraPermissions: user.extraPermissions,
          assignedSiteIds: user.assignedSiteIds,
        }),
        reason: `Added ${user.name} as ${user.role}`,
      },
    });

    return { user, temporaryPassword };
  }

  static async update(
    actor: UserContext,
    userId: string,
    input: {
      name?: string;
      role?: string;
      status?: "ACTIVE" | "INACTIVE";
      phone?: string | null;
      jobTitle?: string | null;
      password?: string;
      extraPermissions?: string[];
      assignedSiteIds?: string[];
    }
  ) {
    const target = await findInOrg(actor, userId);
    const isSelf = target.id === actor.userId;

    if (input.role !== undefined && input.role !== target.role) {
      if (isSelf) throw new AuthorizationError("Forbidden: You cannot change your own role", 403, "FORBIDDEN");
      assertCanAssignRole(actor, input.role);
    }
    if (input.status === "INACTIVE" && isSelf) {
      throw new AuthorizationError("Forbidden: You cannot deactivate your own account", 403, "FORBIDDEN");
    }

    // Keep at least one active admin in the company.
    const losesAdmin =
      (target.role === "ORG_ADMIN" || target.role === "SUPER_ADMIN") &&
      target.status === "ACTIVE" &&
      ((input.role !== undefined && input.role !== "ORG_ADMIN" && input.role !== "SUPER_ADMIN") || input.status === "INACTIVE");
    if (losesAdmin) {
      const otherAdmins = await prisma.user.count({
        where: {
          organizationId: actor.organizationId,
          status: "ACTIVE",
          role: { in: ["ORG_ADMIN", "SUPER_ADMIN"] },
          id: { not: target.id },
        },
      });
      if (otherAdmins === 0) {
        throw new AuthorizationError("Forbidden: The company must keep at least one active admin", 403, "FORBIDDEN");
      }
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.role !== undefined) data.role = input.role;
    if (input.status !== undefined) data.status = input.status;
    if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
    if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle?.trim() || null;
    if (input.extraPermissions !== undefined) {
      if (isSelf && actor.role !== "SUPER_ADMIN" && actor.role !== "ORG_ADMIN") {
        throw new AuthorizationError("Forbidden: You cannot modify your own permissions", 403, "FORBIDDEN");
      }
      const nextExtras = validateAndSanitizeExtraPermissions(actor, input.extraPermissions);
      data.extraPermissionsJson = nextExtras.length > 0 ? JSON.stringify(nextExtras) : null;
    }
    if (input.assignedSiteIds !== undefined) {
      const sanitizedSites = await validateAndSanitizeAssignedSiteIds(actor, input.assignedSiteIds);
      data.assignedSiteIdsJson = sanitizedSites.length > 0 ? JSON.stringify(sanitizedSites) : null;
    }
    if (input.password !== undefined && input.password.trim()) {
      const trimmedPwd = input.password.trim();
      if (trimmedPwd.length < 6) {
        throw new Error("Password must be at least 6 characters long");
      }
      data.passwordHash = await hashPassword(trimmedPwd);
    }

    let updatedRaw: any;
    try {
      updatedRaw = await prisma.user.update({ where: { id: target.id }, data, select: PUBLIC_USER_SELECT });
    } catch (err: any) {
      if (err?.code === "P2022" || String(err?.message || "").includes("assignedSiteIdsJson")) {
        delete data.assignedSiteIdsJson;
        updatedRaw = await prisma.user.update({
          where: { id: target.id },
          data,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            phone: true,
            jobTitle: true,
            extraPermissionsJson: true,
            lastLoginAt: true,
            createdAt: true,
          },
        });
      } else {
        throw err;
      }
    }
    const updated = formatPublicUser(updatedRaw);

    if (input.assignedSiteIds !== undefined) {
      const sanitizedSites = await validateAndSanitizeAssignedSiteIds(actor, input.assignedSiteIds);
      await syncUserSiteProjectAssignments(actor, target.id, input.role || target.role, sanitizedSites);
    }

    // Sync renamed staff names into linked WorkforceMember and headcount records so
    // Day Book, Command Center timeline, and Attendance views immediately show the new name.
    if (input.name !== undefined && updated.name) {
      const empCode = `USR-${target.id.slice(-6).toUpperCase()}`;
      await Promise.all([
        prisma.workforceMember
          .updateMany({
            where: {
              organizationId: actor.organizationId,
              OR: [
                { employeeCode: empCode },
                {
                  name: target.name,
                  OR: [
                    { employeeCode: { startsWith: "USR-" } },
                    { employeeCode: { startsWith: "STF-" } },
                    { workerType: { in: STAFF_LINKED_WORKER_TYPES } },
                  ],
                },
              ],
            },
            data: { name: updated.name },
          })
          .catch(() => {}),
        prisma.workforceHeadcount
          .updateMany({
            where: { organizationId: actor.organizationId, supervisorId: target.id },
            data: { supervisorName: updated.name },
          })
          .catch(() => {}),
      ]);
    }

    const action =
      input.status && input.status !== target.status
        ? input.status === "INACTIVE"
          ? "USER_DEACTIVATED"
          : "USER_REACTIVATED"
        : input.role && input.role !== target.role
        ? "ROLE_CHANGED"
        : "USER_UPDATED";

    const beforeExtras = normalizeExtraPermissions((target as { extraPermissionsJson?: string | null }).extraPermissionsJson);
    let beforeAssignedSiteIds: string[] = [];
    if ((target as any).assignedSiteIdsJson) {
      try {
        const parsed = JSON.parse((target as any).assignedSiteIdsJson);
        if (Array.isArray(parsed)) beforeAssignedSiteIds = parsed.filter(Boolean);
      } catch {}
    }
    await prisma.auditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action,
        entityType: "USER",
        entityId: target.id,
        beforeJson: JSON.stringify({
          name: target.name,
          role: target.role,
          status: target.status,
          phone: target.phone,
          jobTitle: target.jobTitle,
          extraPermissions: beforeExtras,
          assignedSiteIds: beforeAssignedSiteIds,
        }),
        afterJson: JSON.stringify({
          name: updated.name,
          role: updated.role,
          status: updated.status,
          phone: updated.phone,
          jobTitle: updated.jobTitle,
          extraPermissions: updated.extraPermissions,
          assignedSiteIds: updated.assignedSiteIds,
        }),
        reason: `${action.replace(/_/g, " ").toLowerCase()}: ${updated.name}`,
      },
    });

    return updated;
  }

  static async resetPassword(actor: UserContext, userId: string, customPassword?: string) {
    const target = await findInOrg(actor, userId);
    let finalPassword = customPassword?.trim();
    if (finalPassword) {
      if (finalPassword.length < 6) {
        throw new Error("Password must be at least 6 characters long");
      }
    } else {
      finalPassword = generateTemporaryPassword();
    }
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(finalPassword) } });
    await prisma.auditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "PASSWORD_RESET",
        entityType: "USER",
        entityId: target.id,
        reason: customPassword ? `Password explicitly set for ${target.name} by administrator` : `Password reset for ${target.name}`,
      },
    });
    return { temporaryPassword: finalPassword };
  }

  static async delete(actor: UserContext, userId: string) {
    if (actor.userId === userId) {
      throw new Error("You cannot remove your own account.");
    }
    const target = await findInOrg(actor, userId);

    if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
      throw new AuthorizationError("Only a Super Admin can remove another Super Admin account.");
    }

    const orgId = actor.organizationId;
    await prisma.$transaction(async (tx) => {
      // 1. Unassign from projects & tasks
      await tx.project.updateMany({
        where: { organizationId: orgId, managerUserId: target.id },
        data: { managerUserId: null },
      });

      await tx.task.updateMany({
        where: { organizationId: orgId, assigneeUserId: target.id },
        data: { assigneeUserId: null },
      });

      await tx.task.updateMany({
        where: { organizationId: orgId, completedById: target.id },
        data: { completedById: null },
      });

      await tx.task.updateMany({
        where: { organizationId: orgId, verifiedById: target.id },
        data: { verifiedById: null },
      });

      // 2. Reassign creator fields to actor if needed
      await tx.task.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      });

      await tx.stockMovement.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      });

      await tx.bill.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      });

      await tx.payment.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      });

      await tx.dailySiteReport.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      });

      await (tx as any).materialQuotation?.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      }).catch(() => {});

      await (tx as any).attachment?.updateMany({
        where: { organizationId: orgId, uploadedBy: target.id },
        data: { uploadedBy: actor.userId },
      }).catch(() => {});

      await (tx as any).materialRequest?.updateMany({
        where: { organizationId: orgId, requestedById: target.id },
        data: { requestedById: actor.userId },
      }).catch(() => {});

      await (tx as any).materialRequest?.updateMany({
        where: { organizationId: orgId, reviewedById: target.id },
        data: { reviewedById: null },
      }).catch(() => {});

      await (tx as any).attendanceSession?.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      }).catch(() => {});

      await (tx as any).attendanceSession?.updateMany({
        where: { organizationId: orgId, correctedBy: target.id },
        data: { correctedBy: null },
      }).catch(() => {});

      await (tx as any).measurementBookEntry?.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      }).catch(() => {});

      await (tx as any).measurementBookEntry?.updateMany({
        where: { organizationId: orgId, approvedBy: target.id },
        data: { approvedBy: null },
      }).catch(() => {});

      await (tx as any).auditEvent?.updateMany({
        where: { organizationId: orgId, actorUserId: target.id },
        data: { actorUserId: actor.userId },
      }).catch(() => {});

      await (tx as any).purchaseOrder?.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      }).catch(() => {});

      await (tx as any).conversation?.updateMany({
        where: { organizationId: orgId, createdById: target.id },
        data: { createdById: actor.userId },
      }).catch(() => {});

      await (tx as any).siteDiaryEntry?.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      }).catch(() => {});

      await (tx as any).salesReceipt?.updateMany({
        where: { organizationId: orgId, createdBy: target.id },
        data: { createdBy: actor.userId },
      }).catch(() => {});

      await (tx as any).workReport?.updateMany({
        where: { organizationId: orgId, reviewedById: target.id },
        data: { reviewedById: null },
      }).catch(() => {});

      await (tx as any).projectAssignment?.updateMany({
        where: { assignedById: target.id },
        data: { assignedById: actor.userId },
      }).catch(() => {});

      await (tx as any).staffCompensation?.deleteMany({
        where: { organizationId: orgId, userId: target.id },
      }).catch(() => {});

      await (tx as any).pushSubscription?.deleteMany({
        where: { organizationId: orgId, userId: target.id },
      }).catch(() => {});

      await (tx as any).taskStatusHistory?.deleteMany({
        where: { changedBy: target.id },
      }).catch(() => {});

      // 3. Delete assignments & permissions
      await tx.projectAssignment.deleteMany({
        where: { userId: target.id },
      });

      await tx.folderPermission.deleteMany({
        where: { userId: target.id },
      });

      await tx.notification.deleteMany({
        where: { userId: target.id },
      });

      await tx.conversationParticipant.deleteMany({
        where: { userId: target.id },
      });

      // 4. Delete user
      await tx.user.delete({
        where: { id: target.id },
      });

      // 5. Audit log
      await tx.auditEvent.create({
        data: {
          organizationId: orgId,
          actorUserId: actor.userId,
          action: "USER_DELETED",
          entityType: "USER",
          entityId: target.id,
          reason: `User removed: ${target.name} (${target.email})`,
        },
      });
    });

    return { success: true, deletedId: target.id, email: target.email };
  }
}
