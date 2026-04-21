// Workspace feature entitlements.
//
// Superadmin toggles these per workspace on /admin/features. Each
// workspace row has `enabled_features text[]`; when the array is
// null/empty we default to "all features enabled" so existing
// customers don't silently lose access when we add entries here.
//
// Product minimums (contacts, clients, appointments, schedule, basic
// dashboard) are NOT in this list — they're the always-on bundle that
// comes with any paid plan. Don't add them unless you're prepared to
// actually gate the routes.

export const FEATURE_DEFINITIONS = {
  dante: {
    id: "dante",
    name: "Dante",
    description:
      "Natural-language workflow generator, templates library, and workflow runtime.",
  },
  archive: {
    id: "archive",
    name: "Archive",
    description:
      "Citation-grounded document store. Powers archive_lookup in workflows and source-pinned answers.",
  },
  grounded_summaries: {
    id: "grounded_summaries",
    name: "Grounded summaries",
    description:
      "Verified-claim call summaries with source citations and the verified-% dashboard signal.",
  },
  compliance_scanner: {
    id: "compliance_scanner",
    name: "Compliance scanner",
    description:
      "Automatic rule checks on summaries and notes. Populates the Awaiting review queue.",
  },
  ai_receptionist: {
    id: "ai_receptionist",
    name: "AI Receptionist",
    description:
      "Twilio-powered inbound voice handler with configurable question flows.",
  },
  custom_summary_template: {
    id: "custom_summary_template",
    name: "Custom summary template",
    description:
      "Per-workspace prompt customization for call and meeting summaries.",
  },
  knowledge_base: {
    id: "knowledge_base",
    name: "Knowledge base",
    description:
      "Workspace-wide context the receptionist and summarizer use when answering.",
  },
} as const;

export type FeatureId = keyof typeof FEATURE_DEFINITIONS;

export const ALL_FEATURE_IDS: FeatureId[] = Object.keys(
  FEATURE_DEFINITIONS
) as FeatureId[];

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
  enabledFeatures?: string[] | null
): FeatureId[] {
  if (enabledFeatures == null) return ALL_FEATURE_IDS;
  return enabledFeatures.filter((f) => f in FEATURE_DEFINITIONS) as FeatureId[];
}
