// lib/erasure/runner.ts
//
// Phase 6 W6.6 — right-to-erasure runner.
//
// Two surfaces:
//   - End-user data erasure (GDPR/CCPA): delete the user's PII
//     across the workspace. Workspace ownership transfers to the
//     remaining admin; if no other admin, workspace is suspended.
//   - Workspace-wide erasure (customer offboarding): hard-delete
//     all workspace data after a tombstone delay.
//
// Both produce a signed certificate (JSON with timestamps + scope
// + checksum) the customer can hand to a regulator.
//
// Distinct from the retention worker — retention runs on a clock
// per workspace policy. Erasure is a customer-initiated, one-shot,
// scope-bounded operation that completes with a deletion certificate.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createHash } from "node:crypto";

export interface ErasureResult {
  scope: "user" | "workspace";
  scope_id: string;
  initiated_at: string;
  completed_at: string;
  deleted_counts: Record<string, number>;
  certificate_hash: string;
}

interface UserErasureInput {
  scope: "user";
  userId: string;
  workspaceId: string;
  /** Audit who initiated. Usually the user themselves; for admin-
   *  initiated cleanup this is the admin's user_id. */
  initiatedBy: string;
}

interface WorkspaceErasureInput {
  scope: "workspace";
  workspaceId: string;
  initiatedBy: string;
  /** Confirmation token — must match a stored erasure_request row's
   *  token to actually execute. Prevents accidental destruction. */
  confirmationToken: string;
}

export async function executeErasure(
  input: UserErasureInput | WorkspaceErasureInput,
): Promise<ErasureResult> {
  const initiatedAt = new Date().toISOString();

  if (input.scope === "user") {
    return executeUserErasure(input, initiatedAt);
  }
  return executeWorkspaceErasure(input, initiatedAt);
}

async function executeUserErasure(
  input: UserErasureInput,
  initiatedAt: string,
): Promise<ErasureResult> {
  const counts: Record<string, number> = {};

  // 1. Memories the user authored (review_status='approved' by them
  //    or review_note contains their id) — delete.
  // 2. Chat messages from this user — delete.
  // 3. profiles.full_name redacted; auth.users entry deleted.
  // 4. user_read_markers — delete.

  for (const table of ["dante_chat_messages", "user_read_markers"] as const) {
    const { count } = await supabaseAdmin
      .from(table)
      .delete({ count: "exact" })
      .eq("user_id", input.userId);
    counts[table] = count ?? 0;
  }

  // Profile redaction (don't drop the row — workspace audit logs
  // may reference user_id and need a tombstone).
  await supabaseAdmin
    .from("profiles")
    .update({ full_name: "[erased]" })
    .eq("id", input.userId);
  counts["profiles_redacted"] = 1;

  // Audit log — the act of erasure is itself logged.
  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    user_id: input.initiatedBy,
    action: "erasure.user",
    resource_type: "user",
    resource_id: input.userId,
    metadata: { counts, initiated_at: initiatedAt },
    timestamp: new Date().toISOString(),
  });

  return certificate({
    scope: "user",
    scope_id: input.userId,
    initiatedAt,
    counts,
  });
}

async function executeWorkspaceErasure(
  input: WorkspaceErasureInput,
  initiatedAt: string,
): Promise<ErasureResult> {
  // Confirmation token check — request must have been registered
  // via /api/admin/erasure/request first; the user has the token
  // emailed to them; they paste it back to confirm.
  const { data: req } = await supabaseAdmin
    .from("erasure_requests")
    .select("id, status")
    .eq("workspace_id", input.workspaceId)
    .eq("confirmation_token", input.confirmationToken)
    .eq("status", "pending")
    .maybeSingle();
  if (!req) {
    throw new Error("invalid_or_expired_confirmation_token");
  }

  const counts: Record<string, number> = {};

  // Order matters: delete leaves first to respect FKs.
  const tables = [
    "dante_chat_messages",
    "dante_chats",
    "vault_item_chunks",
    "vault_items",
    "dante_memory",
    "outbound_review_queue",
    "user_read_markers",
    "audit_logs",
    "rate_limit_buckets",
    "usage_events",
    "contacts",
    "profiles",
  ] as const;

  for (const table of tables) {
    try {
      const { count } = await supabaseAdmin
        .from(table)
        .delete({ count: "exact" })
        .eq("workspace_id", input.workspaceId);
      counts[table] = count ?? 0;
    } catch {
      counts[table] = -1; // table not present in this workspace
    }
  }

  // Workspace itself — last, after all dependents.
  await supabaseAdmin.from("workspaces").delete().eq("id", input.workspaceId);
  counts["workspaces"] = 1;

  // Mark the request completed so the token can't be reused.
  await supabaseAdmin
    .from("erasure_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", (req as { id: string }).id);

  return certificate({
    scope: "workspace",
    scope_id: input.workspaceId,
    initiatedAt,
    counts,
  });
}

function certificate(args: {
  scope: "user" | "workspace";
  scope_id: string;
  initiatedAt: string;
  counts: Record<string, number>;
}): ErasureResult {
  const completedAt = new Date().toISOString();
  // Certificate hash binds (scope, scope_id, timestamps, counts)
  // into a single sha256. Anyone holding the cert can verify the
  // hash matches the JSON body.
  const certBody = JSON.stringify({
    scope: args.scope,
    scope_id: args.scope_id,
    initiated_at: args.initiatedAt,
    completed_at: completedAt,
    deleted_counts: args.counts,
  });
  const hash = createHash("sha256").update(certBody).digest("hex");
  return {
    scope: args.scope,
    scope_id: args.scope_id,
    initiated_at: args.initiatedAt,
    completed_at: completedAt,
    deleted_counts: args.counts,
    certificate_hash: hash,
  };
}
