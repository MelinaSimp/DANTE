// Desktop chat system prompt for Dante / Vergil.
//
// Authoritative source: `prompts/dante-v3.md` and `prompts/vergil-v3.md`.
// We load and cache them at module level so the disk file IS the
// production prompt — no inlined copy can drift.
//
// Phase 3+ panel finding (Priya): "the disk prompts are not yet
// authoritative" — runtime builder used to inline its own copy.
// This file is now the single seam: edit the markdown, redeploy,
// behavior changes. `getActivePromptVersion()` is logged on every
// agent run for traceability so an audit can match an output to
// the prompt rev that produced it.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getIndustryConfig } from "@/lib/industry/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface BuildDantePromptInput {
  industry: string | null;
  /** Phase 7 W7.5 — when set, append per-firm custom instructions
   *  loaded from workspace_firm_prompts. Audit-visible additions to
   *  the standard prompt. Optional. */
  workspaceId?: string;
}

// Cache parsed prompt bodies to avoid disk hits on every chat turn.
// Cache key: file mtime — re-reads only when the file changes,
// which is what we want for hot-reloading in dev and a stable
// production read.
interface CachedPrompt {
  mtimeMs: number;
  body: string;
  version: string;
}

const promptCache = new Map<string, CachedPrompt>();

const PROMPT_FILES: Record<"financial_advisor" | "real_estate", string> = {
  financial_advisor: "prompts/dante-v3.md",
  real_estate: "prompts/vergil-v3.md",
};

function loadPrompt(relPath: string): CachedPrompt {
  const abs = join(process.cwd(), relPath);
  const stat = statSync(abs);
  const cached = promptCache.get(relPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached;

  const raw = readFileSync(abs, "utf8");
  // Pull the version line out of the frontmatter-ish header. Both
  // markdown files start with "**Version:** N.N" on a known line —
  // we tag every agent run with this so an audit can match output
  // to prompt rev. If parsing fails we fall back to the file
  // mtime, which is monotonically increasing and good enough.
  const versionMatch = raw.match(/\*\*Version:\*\*\s*([\w.-]+)/);
  const version = versionMatch?.[1] ?? `mtime-${stat.mtimeMs}`;

  const cache: CachedPrompt = {
    mtimeMs: stat.mtimeMs,
    body: raw,
    version,
  };
  promptCache.set(relPath, cache);
  return cache;
}

export function buildDanteSystemPrompt(input: BuildDantePromptInput): string {
  const config = getIndustryConfig(input.industry);
  const key: keyof typeof PROMPT_FILES =
    input.industry === "real_estate" ? "real_estate" : "financial_advisor";
  try {
    const { body } = loadPrompt(PROMPT_FILES[key]);
    return body;
  } catch (err) {
    // If the prompt file is missing (corrupted deploy, etc.), fall
    // back to a minimal prompt so the chat surface stays operational.
    // We log loudly so observability catches it.
    console.error(
      `[system-prompt] failed to load ${PROMPT_FILES[key]}, using fallback:`,
      err,
    );
    return fallbackPrompt(config.assistantName);
  }
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
  const key: keyof typeof PROMPT_FILES =
    industry === "real_estate" ? "real_estate" : "financial_advisor";
  try {
    return loadPrompt(PROMPT_FILES[key]).version;
  } catch {
    return "fallback";
  }
}

export function getAssistantName(industry: string | null): string {
  return getIndustryConfig(industry).assistantName;
}

// Last-resort fallback for catastrophic file-loading failure. Kept
// minimal — the real prompt lives in prompts/*.md and edits there
// are what production sees.
function fallbackPrompt(assistantName: string): string {
  return `You are ${assistantName}, an AI assistant. Search workspace memory and the document vault before answering. Cite every document-grounded claim inline using [v1] / [mem:abc] markers. If you cannot find supporting context for a claim, say so plainly — never invent citations or facts.`;
}
