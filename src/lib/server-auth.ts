import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext, UserContext } from "@/lib/auth";
import { Role, Permission, hasPermission } from "@/lib/permissions";

export class AuthorizationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 403, code: string = "FORBIDDEN") {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * 1. Require Authenticated User Context
 */
export async function requireUserContext(
  req: NextRequest,
  requiredPermission?: Permission
): Promise<UserContext> {
  const user = await getUserContext(req);
  if (!user) {
    throw new AuthorizationError("Authentication required", 401, "UNAUTHORIZED");
  }
  if (requiredPermission) {
    requirePermission(user, requiredPermission);
  }
  return user;
}

/**
 * 2. Require Role / Permission
 */
export function requirePermission(user: UserContext, permission: Permission): void {
  if (!hasPermission(user.role, permission)) {
    throw new AuthorizationError(
      `Forbidden: Role ${user.role} lacks required permission '${permission}'`,
      403,
      "FORBIDDEN"
    );
  }
}

/**
 * 3. Financial Data Access Check
 */
export function canReadFinance(user: UserContext): boolean {
  return hasPermission(user.role, "finance:read");
}

export function requireFinanceRead(user: UserContext): void {
  requirePermission(user, "finance:read");
}

export function requireFinanceWrite(user: UserContext): void {
  requirePermission(user, "finance:write");
}

export function requireFinanceReverse(user: UserContext): void {
  requirePermission(user, "finance:reverse");
}

/**
 * 4. Check if user is Super Admin or Organization Admin (Owner privileges)
 */
export function isOrgOwnerOrAdmin(user: UserContext): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
}

/**
 * 5. Check if user has access to a specific Project
 * - Owners/Admins have access to all projects in their organization.
 * - Other users have access only if:
 *    a) They are the managerUserId on the project, OR
 *    b) They have an ACTIVE ProjectAssignment for the project.
 */
export async function userHasProjectAccess(
  user: UserContext,
  projectId: string
): Promise<boolean> {
  if (isOrgOwnerOrAdmin(user) || user.role === "ACCOUNTANT") return true;

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: user.organizationId,
      isArchived: false,
    },
    select: {
      id: true,
      managerUserId: true,
      assignments: {
        where: {
          userId: user.userId,
          status: "ACTIVE",
        },
        select: { id: true },
      },
    },
  });

  if (!project) return false;
  if (project.managerUserId === user.userId) return true;
  if (project.assignments.length > 0) return true;

  // Check if user has assigned or created tasks in this project
  const taskCount = await prisma.task.count({
    where: {
      projectId: project.id,
      organizationId: user.organizationId,
      isArchived: false,
      OR: [{ assigneeUserId: user.userId }, { createdBy: user.userId }],
    },
  });
  if (taskCount > 0) return true;

  return false;
}

export async function requireProjectAccess(
  user: UserContext,
  projectId: string,
  requiredPermission?: Permission
): Promise<void> {
  if (requiredPermission) {
    requirePermission(user, requiredPermission);
  }

  const hasAccess = await userHasProjectAccess(user, projectId);
  if (!hasAccess) {
    throw new AuthorizationError(
      "Project not found or access denied",
      403,
      "PROJECT_ACCESS_DENIED"
    );
  }
}

/**
 * 6. Get list of accessible Project IDs for filtering
 * Returns null if user has org-wide project access (Super Admin / Org Admin).
 * Otherwise returns string[] of project IDs.
 */
export async function getUserAccessibleProjectIds(
  user: UserContext
): Promise<string[] | null> {
  if (isOrgOwnerOrAdmin(user) || user.role === "ACCOUNTANT") return null;

  const [managedProjects, assignedProjects, taskProjects] = await Promise.all([
    prisma.project.findMany({
      where: {
        organizationId: user.organizationId,
        managerUserId: user.userId,
        isArchived: false,
      },
      select: { id: true },
    }),
    prisma.projectAssignment.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.userId,
        status: "ACTIVE",
        project: { isArchived: false },
      },
      select: { projectId: true },
    }),
    prisma.task.findMany({
      where: {
        organizationId: user.organizationId,
        isArchived: false,
        OR: [{ assigneeUserId: user.userId }, { createdBy: user.userId }],
      },
      select: { projectId: true },
    }),
  ]);

  const ids = new Set<string>();
  managedProjects.forEach((p) => ids.add(p.id));
  assignedProjects.forEach((a) => ids.add(a.projectId));
  taskProjects.forEach((t) => {
    if (t.projectId) ids.add(t.projectId);
  });

  return Array.from(ids);
}

/**
 * 7. Check Folder Access
 */
export async function requireFolderAccess(
  user: UserContext,
  folderId: string,
  action: "view" | "upload" | "edit" | "delete" | "download"
): Promise<any> {
  const folder = await prisma.documentFolder.findFirst({
    where: {
      id: folderId,
      organizationId: user.organizationId,
      isArchived: false,
    },
    include: {
      permissions: {
        where: {
          OR: [
            { userId: user.userId },
            { role: user.role },
          ],
        },
      },
    },
  });

  if (!folder) {
    throw new AuthorizationError("Folder not found or access denied", 404, "NOT_FOUND");
  }

  // First verify project access
  await requireProjectAccess(user, folder.projectId);

  // If user is owner/admin, full access granted
  if (isOrgOwnerOrAdmin(user)) return folder;

  // Check specific folder permissions if configured
  if (folder.permissions.length > 0) {
    const perm = folder.permissions[0];
    if (action === "view" && !perm.canView) {
      throw new AuthorizationError("View access denied for this folder", 403, "FORBIDDEN");
    }
    if (action === "upload" && !perm.canUpload) {
      throw new AuthorizationError("Upload access denied for this folder", 403, "FORBIDDEN");
    }
    if (action === "edit" && !perm.canEdit) {
      throw new AuthorizationError("Edit access denied for this folder", 403, "FORBIDDEN");
    }
    if (action === "delete" && !perm.canDelete) {
      throw new AuthorizationError("Delete access denied for this folder", 403, "FORBIDDEN");
    }
    if (action === "download" && !perm.canDownload) {
      throw new AuthorizationError("Download access denied for this folder", 403, "FORBIDDEN");
    }
  } else {
    // Default folder action checks based on general role permissions
    if (action === "delete" || action === "edit") {
      requirePermission(user, "projects:write");
    }
  }

  return folder;
}
