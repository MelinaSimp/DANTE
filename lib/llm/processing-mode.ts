// lib/llm/processing-mode.ts
//
// Resolves the effective processing_mode for a given operation.
// The hierarchy is workspace default → contact override → doc
// override → chat override; MOST RESTRICTIVE wins (local_only
// beats cloud).
//
// "Most restrictive wins" matters: if the workspace defaults to
// cloud but a specific high-net-worth contact is flagged
// local_only, every operation involving that contact's data goes
// local. Conversely, a workspace defaulting to local_only can NOT
// be loosened by a contact's "cloud" override — the strictest
// applicable mode is the answer.
//
// Audit log: every resolution that lands on local_only writes a
// row to audit_logs with action='processing_mode.local_resolved'
// so the SEC-inquiry answer to "which threads ran locally?" is
// precise.

import { supabaseAdmin } from "@/lib/supabase/admin";

export type ProcessingMode = "cloud" | "local_only";

export interface ProcessingModeContext {
  workspaceId: string;
  /** Optional — when the operation is scoped to a contact (chat
   *  about Smith household, doc upload tagged to Smith). */
  contactId?: string | null;
  /** Optional — when the operation is scoped to a vault item
   *  (vault.cite, doc summary). */
  docId?: string | null;
  /** Optional — when the operation is inside a chat thread that
   *  has its own override. */
  chatId?: string | null;
}

export interface ResolutionResult {
  mode: ProcessingMode;
  /** Which level set the binding mode. Useful for the audit log
   *  ("local_only because the doc was marked sensitive on upload"). */
  decided_by:
    | "workspace_default"
    | "contact_override"
    | "doc_override"
    | "chat_override";
}

/** Return rank: higher = more restrictive. */
function rank(m: ProcessingMode): number {
  return m === "local_only" ? 1 : 0;
}

/**
 * Walks the hierarchy and returns the binding mode.
 *
 * Does NOT log to audit_logs — caller decides whether to log
 * (e.g. only on actual model invocation, not on speculative UI
 * checks). See `logResolution` below for that path.
 */
export async function resolveProcessingMode(
  ctx: ProcessingModeContext,
): Promise<ResolutionResult> {
  // Pull all four levels in one round-trip where possible.
  const [wsRes, contactRes, docRes, chatRes] = await Promise.all([
    supabaseAdmin
      .from("workspaces")
      .select("default_processing_mode")
      .eq("id", ctx.workspaceId)
      .maybeSingle(),
    ctx.contactId
      ? supabaseAdmin
          .from("contacts")
          .select("processing_mode_override")
          .eq("id", ctx.contactId)
          .eq("workspace_id", ctx.workspaceId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.docId
      ? supabaseAdmin
          .from("vault_items")
          .select("processing_mode_override")
          .eq("id", ctx.docId)
          .eq("workspace_id", ctx.workspaceId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.chatId
      ? supabaseAdmin
          .from("dante_chats")
          .select("processing_mode")
          .eq("id", ctx.chatId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const wsMode =
    ((wsRes.data as { default_processing_mode?: ProcessingMode } | null)
      ?.default_processing_mode as ProcessingMode) ?? "cloud";
  const contactMode =
    ((contactRes.data as { processing_mode_override?: ProcessingMode } | null)
      ?.processing_mode_override as ProcessingMode | null) ?? null;
  const docMode =
    ((docRes.data as { processing_mode_override?: ProcessingMode } | null)
      ?.processing_mode_override as ProcessingMode | null) ?? null;
  const chatMode =
    ((chatRes.data as { processing_mode?: ProcessingMode } | null)
      ?.processing_mode as ProcessingMode | null) ?? null;

  // Walk the hierarchy. Track the level that set the binding mode.
  let mode: ProcessingMode = wsMode;
  let decidedBy: ResolutionResult["decided_by"] = "workspace_default";
  for (const [level, m] of [
    ["contact_override", contactMode],
    ["doc_override", docMode],
    ["chat_override", chatMode],
  ] as const) {
    if (!m) continue;
    if (rank(m) > rank(mode)) {
      mode = m;
      decidedBy = level as ResolutionResult["decided_by"];
    }
  }
  return { mode, decided_by: decidedBy };
}

/**
 * Persist an audit-log entry for a resolution that ended up
 * local_only. We don't log cloud resolutions — those are the
 * default and would explode the log volume. The exam-time
 * question is "which operations were processed locally and
 * therefore are NOT in our cloud-side audit?"; this answers it.
 */
export async function logResolution(
  ctx: ProcessingModeContext,
  result: ResolutionResult,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (result.mode !== "local_only") return;
  try {
    await supabaseAdmin.from("audit_logs").insert({
      workspace_id: ctx.workspaceId,
      action: "processing_mode.local_resolved",
      metadata: {
        decided_by: result.decided_by,
        contact_id: ctx.contactId ?? null,
        doc_id: ctx.docId ?? null,
        chat_id: ctx.chatId ?? null,
        ...metadata,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[processing-mode] audit log write failed:", err);
  }
}
