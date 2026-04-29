// Workspace feature entitlements.
//
// Superadmin toggles these per workspace on /admin/features. Each
// workspace row has `enabled_features text[]`; when the array is
// null/empty we default to "all features enabled" so existing
// customers don't silently lose access when we add entries here.
//
// Each feature is tiered "base" or "addon":
//   - base   = bundled into the $400/mo Drift plan; usually you
//              wouldn't toggle these off, but the toggle exists for
//              free-tier / trial / demo workspaces.
//   - addon  = à-la-carte, billed in addition to base. monthly_price
//              is the per-workspace surcharge.
//
// Product minimums (contacts, clients, appointments, schedule, basic
// dashboard, work queue, audit log) are NOT in this list — they're
// the always-on bundle that comes with any paid plan. Don't add them
// unless you're prepared to actually gate the routes.

export const FEATURE_DEFINITIONS = {
  // ── Base — included with $400/mo Drift core ───────────────────
  dante: {
    id: "dante",
    name: "Dante / Vergil chat",
    description:
      "AI assistant chat surface, contextual ask panels, draft helper, ⌘/ Ask mode, EntityAsk hover handles.",
    tier: "base",
    monthly_price: 0,
  },
  archive: {
    id: "archive",
    name: "Vault archive",
    description:
      "Citation-grounded document store. Powers vault.cite in workflows and source-pinned answers.",
    tier: "base",
    monthly_price: 0,
  },
  grounded_summaries: {
    id: "grounded_summaries",
    name: "Grounded summaries",
    description:
      "Verified-claim call summaries with source citations and the verified-% dashboard signal.",
    tier: "base",
    monthly_price: 0,
  },
  compliance_scanner: {
    id: "compliance_scanner",
    name: "Compliance scanner (rules)",
    description:
      "Deterministic rule-based scan on summaries and outbound emails (FINRA-style language flags). Populates the Compliance filter on /work.",
    tier: "base",
    monthly_price: 0,
  },
  knowledge_base: {
    id: "knowledge_base",
    name: "Knowledge base",
    description:
      "Workspace-wide context the receptionist and summarizer use when answering.",
    tier: "base",
    monthly_price: 0,
  },

  // ── Add-ons — billed on top of $400/mo base ───────────────────
  ai_receptionist: {
    id: "ai_receptionist",
    name: "AI Voice Receptionist",
    description:
      "Vapi-powered always-on inbound voice agent on a dedicated number. Includes 200 minutes/mo; overage at $0.15/min.",
    tier: "addon",
    monthly_price: 200,
  },
  outbound_voice: {
    id: "outbound_voice",
    name: "Outbound Voice",
    description:
      "D/V making outbound calls on the user's behalf — appointment confirmations, callbacks. 100 minutes/mo included; overage at $0.20/min.",
    tier: "addon",
    monthly_price: 150,
  },
  compliance_plus: {
    id: "compliance_plus",
    name: "Compliance Plus (LLM scan)",
    description:
      "LLM-augmented compliance scanning layered on the rules scanner. Catches sentiment, vague advice, and suitability flags. RIA-relevant.",
    tier: "addon",
    monthly_price: 100,
  },
  sms_outreach: {
    id: "sms_outreach",
    name: "SMS Outreach",
    description:
      "Outbound scheduled SMS via Twilio. 200 segments/mo included; overage at $0.01/segment.",
    tier: "addon",
    monthly_price: 50,
  },
  custom_summary_template: {
    id: "custom_summary_template",
    name: "Custom summary template",
    description:
      "Per-workspace prompt customization for call and meeting summaries.",
    tier: "addon",
    monthly_price: 50,
  },
} as const;

export type FeatureId = keyof typeof FEATURE_DEFINITIONS;
export type FeatureTier = "base" | "addon";

export const ALL_FEATURE_IDS: FeatureId[] = Object.keys(
  FEATURE_DEFINITIONS,
) as FeatureId[];

export const BASE_PLAN_PRICE_USD = 400;

/**
 * Resolves the effective feature set for a workspace.
 *
 * - null / undefined → all features (grandfather existing workspaces
 *   that predate a given feature being added to the catalog).
 * - [] (explicit empty array) → nothing enabled. The superadmin
 *   chose to disable all features; respect that rather than
 *   accidentally re-opening everything.
 * - Unknown feature IDs (stale catalog entries) are dropped.
 */
export function getEnabledFeatures(
  enabledFeatures?: string[] | null,
): FeatureId[] {
  if (enabledFeatures == null) return ALL_FEATURE_IDS;
  return enabledFeatures.filter((f) => f in FEATURE_DEFINITIONS) as FeatureId[];
}

/**
 * Compute the workspace's monthly bill from its enabled features.
 * Always includes the base plan price; adds each enabled add-on's
 * monthly_price on top. Used by the /admin/features dashboard so
 * the admin sees real revenue at a glance.
 */
export function computeMonthlyBillUsd(enabledFeatures: FeatureId[]): number {
  const addonSum = enabledFeatures.reduce((sum, id) => {
    const def = FEATURE_DEFINITIONS[id];
    return sum + (def.tier === "addon" ? def.monthly_price : 0);
  }, 0);
  return BASE_PLAN_PRICE_USD + addonSum;
}

export function isAddon(id: FeatureId): boolean {
  return FEATURE_DEFINITIONS[id].tier === "addon";
}
