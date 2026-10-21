import type { UserContext } from "@/lib/auth";
import { AuthorizationError, isOrgOwnerOrAdmin } from "@/lib/server-auth";

/** Admins and HR can see everyone's attendance and work reports. */
export function canViewTeamWork(user: UserContext): boolean {
  return isOrgOwnerOrAdmin(user) || user.role === "HR_VIEWER";
}

export function requireTeamWorkView(user: UserContext): void {
  if (!canViewTeamWork(user)) {
    throw new AuthorizationError("Forbidden: only admins and HR can see the team's work", 403, "FORBIDDEN");
  }
}

export function requireTeamWorkManage(user: UserContext): void {
  if (!isOrgOwnerOrAdmin(user)) {
    throw new AuthorizationError("Forbidden: only admins can change this", 403, "FORBIDDEN");
  }
}
