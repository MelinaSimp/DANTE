// lib/auth/rbac.ts
//
// Granular role-based access control for workspace surfaces.
//
// Pattern:
//
//   const ctx = await requireRole(req, ["owner", "admin"]);
//   if (!ctx.ok) return ctx.response;
//   // ctx.user, ctx.workspaceId, ctx.role are now typed and trusted.
//
// Roles (must match the DB CHECK on profiles.role):
//   - owner    — workspace creator. Settings, billing, members,
//                MCP allowlist, compliance export, retention. Can
//                approve memory + outbound queue items.
//   - admin    — every owner power except billing + workspace delete.
//                Inherits approve rights.
//   - member   — full chat, can write memory (defaults pending),
//                view contacts. Cannot approve client-facing
//                outbound or modify team membership.
//
// Superadmin (`profiles.is_superadmin = true`) bypasses all role
// gates within their workspace. Anything beyond the workspace
// (cross-workspace admin, retention worker trigger) requires
// superadmin explicitly — see the retention route for that pattern.

import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "member";

export const ALL_ROLES: Role[] = ["owner", "admin", "member"];

/** Roles ordered by privilege descending. Used for "X or higher" checks. */
const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export interface AuthContext {
  ok: true;
  userId: string;
  workspaceId: string;
  role: Role;
  isSuperadmin: boolean;
}

export interface AuthFailure {
  ok: false;
  status: number;
  response: Response;
}

/**
 * Require the caller to have one of `allowedRoles` (or be a
 * superadmin). Returns either an AuthContext (proceed) or an
 * AuthFailure (return its `.response` directly).
 */
export async function requireRole(
  _req: NextRequest,
  allowedRoles: Role[],
): Promise<AuthContext | AuthFailure> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return failure(400, "no_workspace");

  const role = ((profile as { role?: string }).role ?? "member") as Role;
  const isSuper = !!(profile as { is_superadmin?: boolean }).is_superadmin;
  if (!isSuper && !allowedRoles.includes(role)) {
    return failure(403, `requires_role:${allowedRoles.join("|")}`);
  }
  return {
    ok: true,
    userId: user.id,
    workspaceId: profile.workspace_id,
    role,
    isSuperadmin: isSuper,
  };
}

/** Convenience: "admin or higher" — owner + admin + super. */
export async function requireAdmin(req: NextRequest) {
  return requireRole(req, ["owner", "admin"]);
}

/** Convenience: "owner only" — strictly the workspace owner + super. */
export async function requireOwner(req: NextRequest) {
  return requireRole(req, ["owner"]);
}

/** Convenience: "any role" — gates auth + workspace, accepts all roles. */
export async function requireAnyRole(req: NextRequest) {
  return requireRole(req, ALL_ROLES);
}

/** Pure check used in non-route contexts (e.g. server components). */
export function roleSatisfies(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** Returns whether `role` may mutate workspace data. Members and up. */
export function canMutate(role: Role): boolean {
  return ALL_ROLES.includes(role);
}

/** Returns whether `role` may approve queued items (memory / outbound). */
export function canApprove(role: Role): boolean {
  return role === "owner" || role === "admin";
}

function failure(status: number, error: string): AuthFailure {
  return {
    ok: false,
    status,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  };
}
