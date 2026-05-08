// Workspace-scoped model selection for the main chat / agent loop.
//
// Resolution order:
//   1. workspaces.model_overrides.bulk  — hybrid routing (new)
//   2. workspaces.default_model          — legacy single-dial (back-compat)
//   3. DEFAULT_AGENT_MODEL               — system default
//
// This file backs the chat agent loop specifically (the "bulk" tier).
// Cheaper/heavier tiers (routing → Haiku, hard reasoning → Opus)
// are picked via lib/dante/model-router.ts pickModel(task, workspace).

import { supabaseAdmin } from "@/lib/supabase/admin";

export const DEFAULT_AGENT_MODEL = "claude-sonnet-4-6";

export async function getWorkspaceModel(
  workspaceId: string | null | undefined,
): Promise<string> {
  if (!workspaceId) return DEFAULT_AGENT_MODEL;
  const { data } = await supabaseAdmin
    .from("workspaces")
    .select("default_model, model_overrides")
    .eq("id", workspaceId)
    .maybeSingle();
  const overrides = (data as { model_overrides?: { bulk?: string } } | null)?.model_overrides;
  const bulkOverride = overrides?.bulk;
  if (typeof bulkOverride === "string" && bulkOverride.trim()) {
    return bulkOverride.trim();
  }
  const legacy = (data as { default_model?: string } | null)?.default_model;
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return DEFAULT_AGENT_MODEL;
}
