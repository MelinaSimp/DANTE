// lib/rbac.ts
//
// Centralized workspace role definitions and permission helpers.
//
// The codebase had mixed conventions for role checks — some code
// compared `role === "admin"`, some did `.toLowerCase()`, some
// used arrays. This file is the single source of truth. All new
// code should import from here instead of hard-coding role strings.
//
// The DB CHECK constraint on profiles.role is:
//   role IN ('owner', 'admin', 'member')

export const WORKSPACE_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[keyof typeof WORKSPACE_ROLES];

/** Loose normalization: trims, lowercases, defaults to member. */
export function normalizeRole(role: string | null | undefined): WorkspaceRole {
  const r = (role || "").trim().toLowerCase();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  return "member";
}

/**
 * Owner is the root of trust for a workspace. Typically exactly one.
 * Can transfer ownership, delete the workspace, manage billing.
 */
export function isOwner(role: string | null | undefined): boolean {
  return normalizeRole(role) === "owner";
}

/**
 * Admin can invite/remove members, deploy agents, rotate API keys,
 * view audit logs, export data. Cannot delete the workspace or
 * manage billing.
 */
export function isAdmin(role: string | null | undefined): boolean {
  return normalizeRole(role) === "admin";
}

/**
 * Owner OR admin. Use this for admin-surface gating (audit log,
 * data export, member management). This is the most common check
 * in the codebase — prefer this over writing the array inline.
 */
export function isWorkspaceAdmin(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "owner" || r === "admin";
}

/**
 * Member or above — i.e. anyone with a workspace seat.
 */
export function isMember(role: string | null | undefined): boolean {
  return ["owner", "admin", "member"].includes(normalizeRole(role));
}

/**
 * Returns true if the actor is allowed to take the action.
 * Currently just a thin layer over the booleans above, but
 * centralizes the mapping so new actions are easy to add.
 */
export type Permission =
  | "workspace.delete"
  | "workspace.manage_billing"
  | "workspace.invite_member"
  | "workspace.remove_member"
  | "workspace.change_member_role"
  | "workspace.export_data"
  | "workspace.view_audit_log"
  | "workspace.configure_sso"
  | "agent.deploy"
  | "agent.rotate_api_key";

const PERMISSIONS: Record<Permission, (role: WorkspaceRole) => boolean> = {
  "workspace.delete": (r) => r === "owner",
  "workspace.manage_billing": (r) => r === "owner",
  "workspace.invite_member": (r) => r === "owner" || r === "admin",
  "workspace.remove_member": (r) => r === "owner" || r === "admin",
  "workspace.change_member_role": (r) => r === "owner",
  "workspace.export_data": (r) => r === "owner" || r === "admin",
  "workspace.view_audit_log": (r) => r === "owner" || r === "admin",
  "workspace.configure_sso": (r) => r === "owner",
  "agent.deploy": (r) => r === "owner" || r === "admin",
  "agent.rotate_api_key": (r) => r === "owner" || r === "admin",
};

export function can(
  role: string | null | undefined,
  permission: Permission
): boolean {
  const r = normalizeRole(role);
  const check = PERMISSIONS[permission];
  return check ? check(r) : false;
}
