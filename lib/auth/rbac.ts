// lib/auth/rbac.ts
//
// Phase 3+ panel fix #9 — granular role-based access control.
//
// Schema added profiles.role: admin | supervisor | advisor | read_only.
// This module is the helper layer route handlers use to enforce it.
//
// Pattern:
//
//   const ctx = await requireRole(req, ["admin", "supervisor"]);
//   if (!ctx.ok) return ctx.response;
//   // ctx.user, ctx.workspaceId, ctx.role are now typed and trusted.
//
// Roles:
//   - admin       — workspace settings, members, billing, MCP allowlist,
//                   compliance export, retention overrides.
//   - supervisor  — RIA principal / realtor designated broker. Can
//                   approve memory + outbound queue items. Required
//                   for client-facing autonomous send-offs.
//   - advisor     — full chat, can write memory (defaults pending),
//                   view own contacts. Cannot approve.
//   - read_only   — examiner / auditor. View, never mutate.
//
// Superadmin (`profiles.is_superadmin = true`) bypasses all role
// gates within their workspace. Anything beyond the workspace
// (cross-workspace admin, retention worker trigger) requires
// superadmin explicitly — see the retention route for that pattern.

import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export type Role = "admin" | "supervisor" | "advisor" | "read_only";

export const ALL_ROLES: Role[] = ["admin", "supervisor", "advisor", "read_only"];

/** Roles ordered by privilege descending. Used for "X or higher" checks. */
const ROLE_RANK: Record<Role, number> = {
  admin: 4,
  supervisor: 3,
  advisor: 2,
  read_only: 1,
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

  const role = ((profile as { role?: string }).role ?? "advisor") as Role;
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

/** Convenience: "supervisor or higher" — admin + supervisor + super. */
export async function requireSupervisor(req: NextRequest) {
  return requireRole(req, ["admin", "supervisor"]);
}

/** Convenience: "admin or higher" — admin + super. */
export async function requireAdmin(req: NextRequest) {
  return requireRole(req, ["admin"]);
}

/** Convenience: "any role" — gates auth + workspace, accepts all roles. */
export async function requireAnyRole(req: NextRequest) {
  return requireRole(req, ALL_ROLES);
}

/** Pure check used in non-route contexts (e.g. server components). */
export function roleSatisfies(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** Returns whether `role` may mutate workspace data. read_only cannot. */
export function canMutate(role: Role): boolean {
  return role !== "read_only";
}

/** Returns whether `role` may approve queued items (memory / outbound). */
export function canApprove(role: Role): boolean {
  return role === "admin" || role === "supervisor";
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
