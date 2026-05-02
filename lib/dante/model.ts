// Workspace-scoped model selection.
//
// One dial per workspace, set by an admin in Settings → Model.
// When unset, falls back to DEFAULT_AGENT_MODEL.
//
// Read it from the agent runner so every Dante / Vergil / SMS turn
// honors the workspace setting without each call site having to
// know about it.

import { supabaseAdmin } from "@/lib/supabase/admin";

export const DEFAULT_AGENT_MODEL = "gpt-5";

export async function getWorkspaceModel(
  workspaceId: string | null | undefined,
): Promise<string> {
  if (!workspaceId) return DEFAULT_AGENT_MODEL;
  const { data } = await supabaseAdmin
    .from("workspaces")
    .select("default_model")
    .eq("id", workspaceId)
    .maybeSingle();
  const m = (data as any)?.default_model;
  return typeof m === "string" && m.trim() ? m.trim() : DEFAULT_AGENT_MODEL;
}
