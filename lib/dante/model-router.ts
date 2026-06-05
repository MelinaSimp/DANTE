// lib/dante/model-router.ts
//
// Two responsibilities:
//   1. pickModel(task, workspace) — given a task tier and workspace,
//      return the right Anthropic model id, honoring per-workspace
//      overrides set in /admin/customers.
//   2. meterAndCall(...) — wrap an LLM call so every invocation
//      writes a row into dante_usage_ledger with token counts and
//      the precomputed cost in cents.
//
// Every LLM call site in the app should go through this module; it
// is the single chokepoint that keeps the usage banner, admin
// surface, and billing reconciliation honest.
//
// Pricing rates live in MODEL_RATES below. They're the source of
// truth for cost computation — bake the cost in at write-time so
// historical ledger rows stay accurate after Anthropic changes
// pricing.

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Task tiers ───────────────────────────────────────────────────
//
// The hybrid routing default — three tiers selected per call:
//   • "routing"  — intent classification, cheap structured outputs.
//                   Haiku is plenty.
//   • "bulk"     — most chat turns, retrieval-grounded answers,
//                   summaries, drafts. Sonnet is the sweet spot
//                   between cost and quality.
//   • "hard"     — contradiction detection, RMD/tax edge cases,
//                   Deep Research final synthesis, multi-step
//                   compliance reasoning. Opus earns its keep here.

export type ModelTask = "routing" | "bulk" | "hard";

// System defaults. Workspace overrides (workspaces.model_overrides)
// take precedence; null/missing keys fall through to these.
const DEFAULT_MODEL: Record<ModelTask, string> = {
  routing: "claude-haiku-4-5",
  bulk: "claude-sonnet-4-6",
  hard: "claude-opus-4-7",
};

// ── Pricing table ────────────────────────────────────────────────
//
// Per million tokens, in USD. Encoded as integer microcents (1/1000
// of a cent) for safe integer arithmetic — token counts × rate
// always stays in integer space until the final per-row cents
// rounding.
//
// Update when Anthropic moves pricing. Keep historical ledger rows
// untouched — they were billed at the rate active when the call
// was made.

interface ModelRate {
  /** Price per 1M input tokens (uncached), in microcents. */
  inputUcPerMTok: number;
  /** Price per 1M cached input tokens (cache reads), in microcents. */
  cacheReadUcPerMTok: number;
  /** Price per 1M cache-write input tokens, in microcents. */
  cacheWriteUcPerMTok: number;
  /** Price per 1M output tokens, in microcents. */
  outputUcPerMTok: number;
}

// 1 USD = 100 cents = 100,000 microcents.
// Sonnet: $3/M in, $15/M out → 300_000 / 1_500_000 microcents
// Opus: $15/M in, $75/M out → 1_500_000 / 7_500_000
// Haiku 4.5: $0.80/M in, $4/M out → 80_000 / 400_000
const MODEL_RATES: Record<string, ModelRate> = {
  "claude-haiku-4-5": {
    inputUcPerMTok: 80_000,
    cacheReadUcPerMTok: 8_000,
    cacheWriteUcPerMTok: 100_000,
    outputUcPerMTok: 400_000,
  },
  "claude-sonnet-4-6": {
    inputUcPerMTok: 300_000,
    cacheReadUcPerMTok: 30_000,
    cacheWriteUcPerMTok: 375_000,
    outputUcPerMTok: 1_500_000,
  },
  "claude-opus-4-7": {
    inputUcPerMTok: 1_500_000,
    cacheReadUcPerMTok: 150_000,
    cacheWriteUcPerMTok: 1_875_000,
    outputUcPerMTok: 7_500_000,
  },
};

// Fallback rate when an unknown model id appears (e.g. a new
// variant we haven't priced yet). Conservative — assume Sonnet
// rates so we don't underbill ourselves into a hole.
const FALLBACK_RATE = MODEL_RATES["claude-sonnet-4-6"];

// ── pickModel ────────────────────────────────────────────────────

interface WorkspaceModelOverrides {
  routing?: string;
  bulk?: string;
  hard?: string;
}

interface WorkspaceForRouting {
  model_overrides?: WorkspaceModelOverrides | null;
}

/**
 * Resolve the model id to use for this workspace + task tier.
 * Honors per-workspace override, falls back to system default.
 */
export function pickModel(
  task: ModelTask,
  workspace: WorkspaceForRouting | null | undefined,
): string {
  const override = workspace?.model_overrides?.[task];
  if (override && typeof override === "string") return override;
  return DEFAULT_MODEL[task];
}

// ── Cost computation ─────────────────────────────────────────────

interface UsageBreakdown {
  inputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  outputTokens: number;
}

/**
 * Compute the cost in cents for a usage breakdown against a model.
 * Math is done in microcents to avoid float drift, then rounded up
 * to the nearest cent so we never under-bill ourselves.
 */
export function computeCostCents(model: string, usage: UsageBreakdown): number {
  const rate = MODEL_RATES[model] ?? FALLBACK_RATE;
  const M = 1_000_000;

  const uncachedInput = Math.max(
    0,
    usage.inputTokens - (usage.cachedInputTokens ?? 0) - (usage.cacheWriteTokens ?? 0),
  );

  const totalUc =
    (uncachedInput * rate.inputUcPerMTok) / M +
    ((usage.cachedInputTokens ?? 0) * rate.cacheReadUcPerMTok) / M +
    ((usage.cacheWriteTokens ?? 0) * rate.cacheWriteUcPerMTok) / M +
    (usage.outputTokens * rate.outputUcPerMTok) / M;

  // Microcents → cents, ceiling. A call that costs 0.4 cents still
  // bills 1 cent; this is the floor that protects us at very small
  // calls (Haiku routing turns).
  return Math.ceil(totalUc / 1000);
}

// ── meterAndCall ─────────────────────────────────────────────────
//
// The wrapper. Caller passes:
//   • workspaceId — for the ledger row
//   • model       — the resolved model id (already from pickModel)
//   • feature     — short tag for analytics ('chat', 'memory.search'…)
//   • call()      — async function that does the actual LLM request
//                    and returns { result, usage }
//
// The wrapper writes the ledger row after the call completes.
// Failures during ledger write are logged but never propagated —
// we never want a metering failure to break a user-facing chat.

export interface MeteredCallResult<T> {
  result: T;
  cost_cents: number;
}

export interface MeteredCallInput<T> {
  workspaceId: string;
  model: string;
  feature: string;
  /** Optional workflow attribution for per-workflow cost reporting. */
  workflowId?: string;
  workflowRunId?: string;
  call: () => Promise<{ result: T; usage: UsageBreakdown }>;
}

export async function meterAndCall<T>(
  input: MeteredCallInput<T>,
): Promise<MeteredCallResult<T>> {
  const { workspaceId, model, feature, call, workflowId, workflowRunId } = input;

  const { result, usage } = await call();
  const cost_cents = computeCostCents(model, usage);

  // Fire-and-forget ledger write. Awaited so a quick bug surfaces
  // in logs, but failures don't propagate — chat keeps working
  // even if metering momentarily breaks.
  try {
    const row: Record<string, unknown> = {
      workspace_id: workspaceId,
      model,
      input_tokens: usage.inputTokens,
      cached_input_tokens: usage.cachedInputTokens ?? 0,
      output_tokens: usage.outputTokens,
      cost_cents,
      feature,
    };
    if (workflowId) row.workflow_id = workflowId;
    if (workflowRunId) row.workflow_run_id = workflowRunId;
    const { error } = await supabaseAdmin.from("dante_usage_ledger").insert(row);
    if (error) {
      console.error("[meterAndCall] ledger insert failed:", error.message);
    }
  } catch (e) {
    console.error("[meterAndCall] ledger insert threw:", e);
  }

  return { result, cost_cents };
}

// ── Workspace usage summary ──────────────────────────────────────
//
// The shape every usage-aware surface (banner, settings, admin)
// reads. Computed fresh per call; cheap because the index covers
// (workspace_id, created_at desc).

export interface UsageStatus {
  /** MTD spend in cents. */
  mtd_cents: number;
  /** Workspace's monthly allowance in cents. */
  limit_cents: number;
  /** MTD as integer % of limit (e.g. 105). Capped at 9999 for sane UI. */
  pct: number;
  /** Highest threshold breached this month: 100 | 125 | 150 | 200, or null. */
  tier_breached: 100 | 125 | 150 | 200 | null;
  /** Workspace's overage markup, integer percent. */
  overage_markup_pct: number;
}

const THRESHOLDS = [200, 150, 125, 100] as const;

export async function getUsageStatus(workspaceId: string): Promise<UsageStatus | null> {
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("usage_allowance_cents, overage_markup_pct")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) return null;

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { data: rows } = await supabaseAdmin
    .from("dante_usage_ledger")
    .select("cost_cents")
    .eq("workspace_id", workspaceId)
    .gte("created_at", startOfMonth.toISOString());

  const mtd_cents = (rows || []).reduce(
    (acc: number, r: { cost_cents: number }) => acc + (r.cost_cents || 0),
    0,
  );
  const limit_cents = ws.usage_allowance_cents ?? 3000;
  const pct = limit_cents > 0 ? Math.min(9999, Math.floor((mtd_cents / limit_cents) * 100)) : 0;

  let tier_breached: UsageStatus["tier_breached"] = null;
  for (const t of THRESHOLDS) {
    if (pct >= t) { tier_breached = t; break; }
  }

  return {
    mtd_cents,
    limit_cents,
    pct,
    tier_breached,
    overage_markup_pct: ws.overage_markup_pct ?? 30,
  };
}
