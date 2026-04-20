// lib/dante/archive/guard.ts
//
// Access guard for the Dante Archive surface.
//
// The Archive holds legal + compliance documents (Form ADVs, IPS
// templates, policies, regulations) — files whose content influences
// fiduciary-grade workflows. A regular workspace member silently
// swapping in a wrong policy memo could produce bad advice at scale
// and expose the firm to liability, so the entire Archive (read AND
// write) is locked down to:
//
//   • the workspace owner (one per workspace — the advisor who owns
//     the practice), and
//   • the platform superadmin (Drift staff — used for support).
//
// Workspace members and workspace admins see nothing. Cloned templates
// that reference archive_lookup still work fine because the runner
// uses supabaseAdmin (service-role), bypassing user-level RLS — so
// workflows execute regardless of who triggers them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwner } from "@/lib/rbac";
import { hasSuperadminAccess } from "@/lib/superadmin";

export interface ArchiveAccess {
  allowed: boolean;
  reason: "ok" | "unauthenticated" | "no_workspace" | "forbidden";
  userId?: string;
  userEmail?: string | null;
  workspaceId?: string;
  isOwner: boolean;
  isSuperadmin: boolean;
}

/**
 * Resolve whether the current caller can reach the Archive. Used by
 * every Archive API route and the Archive page servers. Callers get
 * back both the verdict and the details they already need (workspace
 * id, user id) so we don't round-trip the DB twice.
 */
export async function resolveArchiveAccess(
  supabase: SupabaseClient,
): Promise<ArchiveAccess> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { allowed: false, reason: "unauthenticated", isOwner: false, isSuperadmin: false };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return {
      allowed: false, reason: "no_workspace",
      userId: user.id, userEmail: user.email ?? null,
      isOwner: false, isSuperadmin: false,
    };
  }

  const owner = isOwner(profile.role);
  const superadmin = hasSuperadminAccess(user.email, profile.is_superadmin);
  const allowed = owner || superadmin;

  return {
    allowed,
    reason: allowed ? "ok" : "forbidden",
    userId: user.id,
    userEmail: user.email ?? null,
    workspaceId: profile.workspace_id,
    isOwner: owner,
    isSuperadmin: superadmin,
  };
}
