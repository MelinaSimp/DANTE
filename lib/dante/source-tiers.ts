// lib/dante/source-tiers.ts
//
// Source reliability tiering for the DD pipeline and AI analysis.
// Every data source in a workflow is tagged with a tier so the AI
// uses appropriate confidence language in reports:
//   Tier 1 = "Census data shows..." (definitive)
//   Tier 2 = "Per CoStar data..." (sourced)
//   Tier 3 = "Reports suggest..." (hedged)

export type SourceTier = 1 | 2 | 3;

export interface SourceTag {
  tier: SourceTier;
  source: string;
}

interface TierMeta {
  tier: SourceTier;
  label: string;
  examples: string;
  guidance: string;
}

const TIERS: TierMeta[] = [
  {
    tier: 1,
    label: "Government primary data",
    examples: "Census ACS, BLS employment, FEMA flood maps, EPA TRI/Superfund, county assessor records",
    guidance:
      "Cite as authoritative. Use definitive language: 'Census data shows', 'the area has', 'BLS reports'. No hedging needed unless the vintage is dated (e.g. 5-year ACS estimates have a lag).",
  },
  {
    tier: 2,
    label: "Commercial data provider",
    examples: "CoStar, Yardi, Reonomy, Regrid, Google Maps, Placer.ai",
    guidance:
      "Cite the provider by name: 'per CoStar data', 'Yardi records indicate'. Confident but sourced. Note that commercial data is independently compiled but may lag real-time conditions.",
  },
  {
    tier: 3,
    label: "Web search / news",
    examples: "News articles, broker marketing sites, public records aggregators, forums",
    guidance:
      "Cite the specific source by name or URL. Use hedged language: 'reports suggest', 'according to [source]'. Flag if only one source corroborates a claim. If a Tier 3 source contradicts Tier 1, note the discrepancy and defer to the authoritative source. Watch for self-referential sources (a publication citing itself as authoritative is not independent corroboration).",
  },
];

/**
 * Returns a formatted block suitable for injection into an LLM system
 * prompt. Tells the model how to handle each reliability tier.
 */
export function formatTierGuidance(): string {
  return TIERS.map(
    (t) =>
      `TIER ${t.tier} -- ${t.label}\nExamples: ${t.examples}\nGuidance: ${t.guidance}`,
  ).join("\n\n");
}

/** Pre-built tags for known data sources. */
export const TAGS = {
  census: { tier: 1 as SourceTier, source: "U.S. Census Bureau ACS 5-Year Estimates" },
  bls: { tier: 1 as SourceTier, source: "Bureau of Labor Statistics QCEW" },
  fema: { tier: 1 as SourceTier, source: "FEMA National Flood Hazard Layer" },
  epa_tri: { tier: 1 as SourceTier, source: "EPA Toxics Release Inventory" },
  epa_superfund: { tier: 1 as SourceTier, source: "EPA Superfund / CERCLIS" },
  google_places: { tier: 2 as SourceTier, source: "Google Maps Places API" },
  google_distance: { tier: 2 as SourceTier, source: "Google Maps Distance Matrix API" },
  nominatim: { tier: 2 as SourceTier, source: "OpenStreetMap / Nominatim" },
  web_search: { tier: 3 as SourceTier, source: "Web search (Tavily)" },
} as const;
