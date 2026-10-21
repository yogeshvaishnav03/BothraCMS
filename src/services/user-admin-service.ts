import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword, UserContext } from "@/lib/auth";
import { AuthorizationError } from "@/lib/server-auth";
import { ROLE_PERMISSIONS, Role } from "@/lib/permissions";

/**
 * Staff accounts for one company: add people, change their role, deactivate
 * them and reset passwords. Every change is written to the audit log.
 */

export const ASSIGNABLE_ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  phone: true,
  jobTitle: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

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
    return prisma.user.findMany({
      where: { organizationId: actor.organizationId },
      select: PUBLIC_USER_SELECT,
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
  }

  static async create(
    actor: UserContext,
    input: { name: string; email: string; role: string; phone?: string | null; jobTitle?: string | null }
  ) {
    assertCanAssignRole(actor, input.role);
    const email = input.email.trim().toLowerCase();

    // Login looks people up by email alone, so an address may exist only once.
    const clash = await prisma.user.findFirst({ where: { email } });
    if (clash) {
      throw new AuthorizationError("Validation error: email — A user with this email already exists", 409, "CONFLICT");
    }

    const temporaryPassword = generateTemporaryPassword();
    const user = await prisma.user.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name.trim(),
        email,
        role: input.role,
        phone: input.phone?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        passwordHash: await hashPassword(temporaryPassword),
      },
      select: PUBLIC_USER_SELECT,
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "USER_CREATED",
        entityType: "USER",
        entityId: user.id,
        afterJson: JSON.stringify({ name: user.name, email: user.email, role: user.role }),
        reason: `Added ${user.name} as ${user.role}`,
      },
    });

    return { user, temporaryPassword };
  }

  static async update(
    actor: UserContext,
    userId: string,
    input: { name?: string; role?: string; status?: "ACTIVE" | "INACTIVE"; phone?: string | null; jobTitle?: string | null }
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

    const updated = await prisma.user.update({ where: { id: target.id }, data, select: PUBLIC_USER_SELECT });

    const action =
      input.status && input.status !== target.status
        ? input.status === "INACTIVE"
          ? "USER_DEACTIVATED"
          : "USER_REACTIVATED"
        : input.role && input.role !== target.role
        ? "ROLE_CHANGED"
        : "USER_UPDATED";

    await prisma.auditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action,
        entityType: "USER",
        entityId: target.id,
        beforeJson: JSON.stringify({ name: target.name, role: target.role, status: target.status, phone: target.phone, jobTitle: target.jobTitle }),
        afterJson: JSON.stringify({ name: updated.name, role: updated.role, status: updated.status, phone: updated.phone, jobTitle: updated.jobTitle }),
        reason: `${action.replace(/_/g, " ").toLowerCase()}: ${updated.name}`,
      },
    });

    return updated;
  }

  static async resetPassword(actor: UserContext, userId: string) {
    const target = await findInOrg(actor, userId);
    const temporaryPassword = generateTemporaryPassword();
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(temporaryPassword) } });
    await prisma.auditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "PASSWORD_RESET",
        entityType: "USER",
        entityId: target.id,
        reason: `Password reset for ${target.name}`,
      },
    });
    return { temporaryPassword };
  }
}
