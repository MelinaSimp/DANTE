// lib/billing/plan-tiers.ts
//
// Phase 3+ panel fix #11 — plan tier enforcement.
//
// Three tiers per ADR 0002 / Margaret's GTM thesis:
//
//   starter    — $300/mo. Solo advisors / agents. Chat + memory + vault.
//                Workflows limited. No autonomous agents. No SSO.
//
//   pro        — $800/mo. Small firms. Full workflows + autonomous
//                agents (with supervisor queue). MCP allowlist
//                editable. Up to 5 seats.
//
//   enterprise — $1500/mo. Large RIAs / brokerages. Everything in
//                Pro plus SSO/SCIM, BYOK, dedicated CSM, SLA.
//                Per-seat. Compliance export tooling enabled.
//
// This module defines the feature gates each tier opens. Routes
// that gate features call `requireFeature(workspaceId, feature)`
// and 402 (Payment Required) when the workspace's plan_tier
// doesn't include it.
//
// Feature lists are conservative — adding a feature to a tier is
// reversible (someone gets it for free during rollout, then we
// gate it). Removing a feature from a tier is what tools-of-
// torture customer-success calls are made of, so I'm careful.

import { supabaseAdmin } from "@/lib/supabase/admin";

export type PlanTier = "starter" | "pro" | "enterprise";

export type Feature =
  | "workflows.basic"
  | "workflows.advanced"        // pro+ — agent nodes, MCP integration
  | "autonomous_agents"          // pro+
  | "supervisor_queue"           // pro+
  | "mcp.user_servers"           // pro+ — workspace can register servers
  | "compliance.export"          // enterprise
  | "compliance.fair_housing_model_pass" // enterprise
  | "sso.saml"                   // enterprise
  | "scim.provisioning"          // enterprise
  | "byok.encryption"            // enterprise
  | "api.public"                 // enterprise — public API access
  | "data_residency.choose";     // enterprise

const FEATURE_MATRIX: Record<Feature, PlanTier[]> = {
  "workflows.basic": ["starter", "pro", "enterprise"],
  "workflows.advanced": ["pro", "enterprise"],
  autonomous_agents: ["pro", "enterprise"],
  supervisor_queue: ["pro", "enterprise"],
  "mcp.user_servers": ["pro", "enterprise"],
  "compliance.export": ["enterprise"],
  "compliance.fair_housing_model_pass": ["enterprise"],
  "sso.saml": ["enterprise"],
  "scim.provisioning": ["enterprise"],
  "byok.encryption": ["enterprise"],
  "api.public": ["enterprise"],
  "data_residency.choose": ["enterprise"],
};

interface PlanInfo {
  tier: PlanTier;
  seats: number;
}

const planCache = new Map<string, { info: PlanInfo; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 1000;

async function getPlan(workspaceId: string): Promise<PlanInfo> {
  const cached = planCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) return cached.info;

  const { data } = await supabaseAdmin
    .from("workspaces")
    .select("plan_tier, plan_seats")
    .eq("id", workspaceId)
    .maybeSingle();
  const info: PlanInfo = {
    tier: (data as { plan_tier?: PlanTier } | null)?.plan_tier ?? "starter",
    seats: (data as { plan_seats?: number } | null)?.plan_seats ?? 1,
  };
  planCache.set(workspaceId, { info, expiresAt: Date.now() + CACHE_TTL_MS });
  return info;
}

/** Pure check — does this tier have this feature? */
export function tierHasFeature(tier: PlanTier, feature: Feature): boolean {
  return FEATURE_MATRIX[feature].includes(tier);
}

/** Async check against the workspace's current tier. */
export async function workspaceHasFeature(
  workspaceId: string,
  feature: Feature,
): Promise<boolean> {
  const plan = await getPlan(workspaceId);
  return tierHasFeature(plan.tier, feature);
}

export interface FeatureGateResult {
  ok: boolean;
  /** When ok=false, a Response the route can return directly. */
  response?: Response;
  /** When ok=true, the workspace's plan info. */
  plan?: PlanInfo;
}

/**
 * Route guard helper. Returns ok=true with plan info when the
 * workspace's tier includes the feature; ok=false with a 402
 * response when it doesn't.
 *
 * Usage:
 *   const gate = await requireFeature(workspaceId, "compliance.export");
 *   if (!gate.ok) return gate.response;
 */
export async function requireFeature(
  workspaceId: string,
  feature: Feature,
): Promise<FeatureGateResult> {
  const plan = await getPlan(workspaceId);
  if (tierHasFeature(plan.tier, feature)) return { ok: true, plan };
  return {
    ok: false,
    response: new Response(
      JSON.stringify({
        error: "feature_not_in_plan",
        feature,
        current_tier: plan.tier,
        upgrade_to: FEATURE_MATRIX[feature][0],
      }),
      {
        status: 402, // Payment Required — explicit "you need to upgrade"
        headers: { "Content-Type": "application/json" },
      },
    ),
  };
}

/** Returns the feature → tiers matrix for UI display (settings page). */
export function getFeatureMatrix(): Record<Feature, PlanTier[]> {
  return { ...FEATURE_MATRIX };
}

/** Invalidate plan cache for a workspace (call after a tier change). */
export function invalidatePlanCache(workspaceId: string): void {
  planCache.delete(workspaceId);
}
