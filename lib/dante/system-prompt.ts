// Desktop chat system prompt for Dante / Vergil.
//
// Authoritative source: `prompts/dante-v3.md` and `prompts/vergil-v3.md`.
// Production reads from sibling .ts modules (lib/dante/prompts/*.ts)
// because Vercel's serverless bundler doesn't reliably trace runtime
// fs.readFileSync calls — the .md files were ENOENT in /var/task on
// prod, the agent fell back to a minimal stub, the chat surface
// went silent. Bundling via TS imports is the only reliable path.
//
// Workflow: edit prompts/*.md (canonical, human-edit), then sync the
// content into the matching .ts module under lib/dante/prompts/.
// `getActivePromptVersion()` is logged on every agent run for
// traceability so an audit can match an output to the prompt rev.

import { getIndustryConfig } from "@/lib/industry/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DANTE_V3_PROMPT, DANTE_V3_VERSION } from "./prompts/dante-v3";
import { VERGIL_V3_PROMPT, VERGIL_V3_VERSION } from "./prompts/vergil-v3";

interface BuildDantePromptInput {
  industry: string | null;
  /** Phase 7 W7.5 — when set, append per-firm custom instructions
   *  loaded from workspace_firm_prompts. Audit-visible additions to
   *  the standard prompt. Optional. */
  workspaceId?: string;
}

interface PromptEntry {
  body: string;
  version: string;
}

const PROMPTS: Record<"financial_advisor" | "real_estate", PromptEntry> = {
  financial_advisor: { body: DANTE_V3_PROMPT, version: DANTE_V3_VERSION },
  real_estate: { body: VERGIL_V3_PROMPT, version: VERGIL_V3_VERSION },
};

export function buildDanteSystemPrompt(input: BuildDantePromptInput): string {
  const key: keyof typeof PROMPTS =
    input.industry === "real_estate" ? "real_estate" : "financial_advisor";
  return PROMPTS[key].body;
}

/**
 * Async variant that includes per-firm prompt customization (Phase 7
 * W7.5). Loads workspace_firm_prompts.custom_instructions and
 * appends them after the canonical persona prompt under a clearly
 * labeled "Firm-specific instructions" section so audits can tell
 * what the firm added vs. what's stock.
 *
 * Use this in production routes; the sync version is for tests and
 * places that don't have workspace context.
 */
export async function buildDanteSystemPromptWithFirm(
  input: BuildDantePromptInput,
): Promise<string> {
  const base = buildDanteSystemPrompt(input);
  if (!input.workspaceId) return base;
  try {
    const { data } = await supabaseAdmin
      .from("workspace_firm_prompts")
      .select("custom_instructions")
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    const custom = (data as { custom_instructions?: string } | null)?.custom_instructions;
    if (!custom || !custom.trim()) return base;
    return (
      base +
      "\n\n---\n\nFirm-specific instructions (added by workspace admin):\n" +
      custom.trim()
    );
  } catch (err) {
    console.warn("[system-prompt] firm-prompts load failed:", err);
    return base;
  }
}

/** Returns the version string of the currently-loaded prompt for a
 *  given industry. Used by telemetry / audit logging so every agent
 *  run carries the prompt rev it executed against. */
export function getActivePromptVersion(industry: string | null): string {
  const key: keyof typeof PROMPTS =
    industry === "real_estate" ? "real_estate" : "financial_advisor";
  return PROMPTS[key].version;
}

export function getAssistantName(industry: string | null): string {
  return getIndustryConfig(industry).assistantName;
}
