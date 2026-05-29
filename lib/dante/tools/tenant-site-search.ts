// lib/dante/tools/tenant-site-search.ts
//
// Inverse void analysis: given a tenant's site criteria, find locations
// that match. Instead of "what tenants are missing from this site?", this
// answers "what sites fit this tenant?"
//
// Uses the same Google Places API infrastructure as survey_area to check
// competitor density, and Census Bureau demographics for population and
// household income.

import {
  geocodeAddress as gmapsGeocode,
  surveyNearbyBusinesses,
  type SurveyResult,
} from "@/lib/data-sources/google-maps";
import { geocodeAddress } from "@/lib/site-scan/enrichment/geocoder";
import { getCensusFips } from "@/lib/site-scan/enrichment/geocoder";
import { getCensusDemographics } from "@/lib/site-scan/enrichment/census";
import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ────────────────────────────────────────────────────

export interface TenantSiteSearchArgs {
  tenant_name: string;
  category: string;
  min_population_3mi?: number;
  max_competitors_3mi?: number;
  min_median_hhi?: number;
  max_rent_psf?: number;
  min_sf?: number;
  max_sf?: number;
  target_markets?: string[];
  require_void?: boolean;
}

interface LocationMatch {
  location: string;
  lat: number;
  lng: number;
  score: number;
  population_3mi?: number;
  competitors_3mi: number;
  median_hhi?: number;
  category_status: "void" | "underserved" | "adequate" | "saturated";
  notes: string;
}

interface TenantSiteSearchResult {
  tenant: string;
  criteria_summary: string;
  matches: LocationMatch[];
  searched_at: string;
}

// ── Constants ────────────────────────────────────────────────

const MILES_TO_METERS = 1609.34;
const THREE_MILE_RADIUS = Math.round(3 * MILES_TO_METERS);

/**
 * Map user-facing category names to the survey_area category keys
 * used by Google Places. Allows natural-language input like
 * "Fast Casual" or "Pharmacy" to resolve to the right search bucket.
 */
const CATEGORY_TO_SURVEY: Record<string, string[]> = {
  "fast casual":   ["restaurants"],
  "restaurant":    ["restaurants"],
  "restaurants":   ["restaurants"],
  "qsr":           ["restaurants"],
  "coffee":        ["restaurants"],
  "cafe":          ["restaurants"],
  "bakery":        ["restaurants"],
  "bar":           ["restaurants"],
  "pharmacy":      ["medical"],
  "medical":       ["medical"],
  "healthcare":    ["medical"],
  "dental":        ["medical"],
  "veterinary":    ["medical"],
  "grocery":       ["grocery"],
  "supermarket":   ["grocery"],
  "convenience":   ["grocery"],
  "fitness":       ["fitness"],
  "gym":           ["fitness"],
  "spa":           ["fitness"],
  "retail":        ["retail"],
  "clothing":      ["retail"],
  "electronics":   ["retail"],
  "home goods":    ["retail"],
  "hardware":      ["retail"],
  "pet store":     ["retail"],
  "bank":          ["financial"],
  "financial":     ["financial"],
  "insurance":     ["financial"],
  "education":     ["education"],
  "childcare":     ["childcare"],
  "daycare":       ["childcare"],
  "entertainment": ["entertainment"],
  "movie theater": ["entertainment"],
  "lodging":       ["lodging"],
  "hotel":         ["lodging"],
  "services":      ["services"],
  "laundry":       ["services"],
  "auto repair":   ["services"],
  "gas station":   ["services"],
};

// ── Score weights ────────────────────────────────────────────
// Competitor count: 40%, Population: 25%, Income: 20%, Void status: 15%

const W_COMPETITORS = 0.40;
const W_POPULATION  = 0.25;
const W_INCOME      = 0.20;
const W_VOID        = 0.15;

// ── Helpers ──────────────────────────────────────────────────

/**
 * Resolve the Google Maps API key from workspace integration_connections
 * or fall back to the platform env var.
 */
async function resolveGmapsKey(workspaceId: string): Promise<string | null> {
  try {
    const { data: conn } = await supabaseAdmin
      .from("integration_connections")
      .select("credentials")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_maps")
      .eq("status", "connected")
      .maybeSingle();
    if (conn) {
      const creds = conn.credentials as Record<string, string>;
      if (creds.api_key) return creds.api_key;
    }
  } catch { /* fall through */ }
  return process.env.GOOGLE_MAPS_API_KEY || null;
}

/**
 * Resolve the survey categories to search for a given user-facing
 * category string. Falls back to searching all categories if no
 * mapping exists.
 */
function resolveSurveyCategories(category: string): string[] | undefined {
  const key = category.toLowerCase().trim();
  return CATEGORY_TO_SURVEY[key] ?? undefined;
}

/**
 * Determine the category status based on competitor count within 3 miles.
 * Thresholds are intentionally conservative -- a single competitor in
 * a 3-mile ring is still "underserved" for most national tenants.
 */
function classifyCategory(count: number): "void" | "underserved" | "adequate" | "saturated" {
  if (count === 0) return "void";
  if (count <= 2) return "underserved";
  if (count <= 6) return "adequate";
  return "saturated";
}

/**
 * Score a location against the tenant's criteria. Returns 0-100.
 *
 * Weight breakdown:
 *   - Competitor count (40%): fewer competitors = higher score
 *   - Population (25%): higher population = higher score
 *   - Income (20%): higher median HHI = higher score
 *   - Category void status (15%): void > underserved > adequate > saturated
 */
function scoreLocation(opts: {
  competitors: number;
  maxCompetitors?: number;
  population?: number;
  minPopulation?: number;
  medianHhi?: number;
  minHhi?: number;
  categoryStatus: "void" | "underserved" | "adequate" | "saturated";
}): number {
  // Competitor score: 100 if 0 competitors, scales down.
  // If max_competitors_3mi is set, 0 means at threshold, negative means over.
  let compScore: number;
  if (opts.maxCompetitors != null && opts.maxCompetitors > 0) {
    const ratio = Math.max(0, 1 - opts.competitors / (opts.maxCompetitors * 2));
    compScore = ratio * 100;
  } else {
    // No max set: score inversely with competitor count, cap at 10+
    compScore = opts.competitors === 0 ? 100
      : opts.competitors <= 2 ? 70
      : opts.competitors <= 5 ? 40
      : 15;
  }

  // Population score: 100 if meets or exceeds minimum, partial otherwise
  let popScore = 50; // default if no data
  if (opts.population != null && opts.minPopulation != null && opts.minPopulation > 0) {
    popScore = Math.min(100, (opts.population / opts.minPopulation) * 100);
  } else if (opts.population != null) {
    // No minimum set: score by absolute population (assume 50k is good)
    popScore = Math.min(100, (opts.population / 50000) * 100);
  }

  // Income score: 100 if meets or exceeds minimum, partial otherwise
  let hhiScore = 50; // default if no data
  if (opts.medianHhi != null && opts.minHhi != null && opts.minHhi > 0) {
    hhiScore = Math.min(100, (opts.medianHhi / opts.minHhi) * 100);
  } else if (opts.medianHhi != null) {
    // No minimum set: score by absolute income (assume $80k is good)
    hhiScore = Math.min(100, (opts.medianHhi / 80000) * 100);
  }

  // Void status score
  const voidScores: Record<string, number> = {
    void: 100,
    underserved: 70,
    adequate: 30,
    saturated: 0,
  };
  const voidScore = voidScores[opts.categoryStatus] ?? 50;

  const total =
    compScore * W_COMPETITORS +
    popScore * W_POPULATION +
    hhiScore * W_INCOME +
    voidScore * W_VOID;

  return Math.round(Math.max(0, Math.min(100, total)));
}

/**
 * Build a human-readable criteria summary string.
 */
function buildCriteriaSummary(args: TenantSiteSearchArgs): string {
  const parts: string[] = [`${args.tenant_name} (${args.category})`];
  if (args.min_population_3mi) parts.push(`min pop 3mi: ${args.min_population_3mi.toLocaleString()}`);
  if (args.max_competitors_3mi != null) parts.push(`max competitors 3mi: ${args.max_competitors_3mi}`);
  if (args.min_median_hhi) parts.push(`min HHI: $${args.min_median_hhi.toLocaleString()}`);
  if (args.max_rent_psf) parts.push(`max rent: $${args.max_rent_psf}/SF/yr`);
  if (args.min_sf) parts.push(`min SF: ${args.min_sf.toLocaleString()}`);
  if (args.max_sf) parts.push(`max SF: ${args.max_sf.toLocaleString()}`);
  if (args.require_void) parts.push("require void");
  return parts.join(" | ");
}

// ── Main handler ─────────────────────────────────────────────

/**
 * Search for locations matching a tenant's site criteria.
 * Inverse of void analysis: instead of finding tenants for a site,
 * finds sites for a tenant.
 *
 * For each target market:
 *   1. Geocode the market center
 *   2. Survey nearby businesses to count competitors in the tenant's category
 *   3. Pull Census demographics for population and income
 *   4. Score and rank results
 *
 * @param args - Tenant criteria and target markets
 * @param workspaceId - Workspace for API key resolution
 * @returns JSON string with ranked location matches
 */
export async function handleTenantSiteSearch(
  args: TenantSiteSearchArgs,
  workspaceId: string,
): Promise<string> {
  // ── Validate required fields ──
  const tenantName = (args.tenant_name || "").trim();
  if (!tenantName) {
    return JSON.stringify({ error: "tenant_name is required." });
  }
  const category = (args.category || "").trim();
  if (!category) {
    return JSON.stringify({ error: "category is required." });
  }
  const targetMarkets = args.target_markets;
  if (!targetMarkets || targetMarkets.length === 0) {
    return JSON.stringify({
      error:
        "target_markets is required. Provide at least one market " +
        "(e.g. 'Austin, TX', 'Dallas, TX').",
    });
  }
  if (targetMarkets.length > 10) {
    return JSON.stringify({
      error: "Too many target markets. Maximum is 10 per search.",
    });
  }

  // ── Resolve Google Maps API key ──
  const gmapsKey = await resolveGmapsKey(workspaceId);
  if (!gmapsKey) {
    return JSON.stringify({
      error:
        "Google Maps API key not configured. Connect Google Maps in " +
        "Settings > Integrations, or set GOOGLE_MAPS_API_KEY.",
    });
  }

  // ── Resolve category for survey ──
  const surveyCategories = resolveSurveyCategories(category);

  // ── Process each target market ──
  const matches: LocationMatch[] = [];
  const errors: string[] = [];

  for (const market of targetMarkets) {
    try {
      const match = await evaluateMarket(
        market,
        tenantName,
        category,
        surveyCategories,
        args,
        gmapsKey,
      );
      if (match) {
        matches.push(match);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${market}: ${msg}`);
      console.warn(`[tenant-site-search] error evaluating ${market}:`, err);
    }
  }

  // ── Filter by require_void ──
  let filtered = matches;
  if (args.require_void) {
    filtered = matches.filter(
      (m) => m.category_status === "void" || m.category_status === "underserved",
    );
  }

  // ── Sort by score descending ──
  filtered.sort((a, b) => b.score - a.score);

  const result: TenantSiteSearchResult = {
    tenant: tenantName,
    criteria_summary: buildCriteriaSummary(args),
    matches: filtered,
    searched_at: new Date().toISOString(),
  };

  // Append errors as a separate field if any markets failed
  const output: Record<string, unknown> = { ...result };
  if (errors.length > 0) {
    output.warnings = errors;
  }

  return JSON.stringify(output);
}

/**
 * Evaluate a single target market against the tenant's criteria.
 * Geocodes the market, surveys competitors, fetches demographics,
 * and returns a scored LocationMatch.
 */
async function evaluateMarket(
  market: string,
  tenantName: string,
  category: string,
  surveyCategories: string[] | undefined,
  args: TenantSiteSearchArgs,
  gmapsKey: string,
): Promise<LocationMatch | null> {
  // 1. Geocode the market
  let lat: number;
  let lng: number;
  let resolvedName: string;

  const gmapsGeo = await gmapsGeocode(market, gmapsKey);
  if (gmapsGeo) {
    lat = gmapsGeo.latitude;
    lng = gmapsGeo.longitude;
    resolvedName = gmapsGeo.formatted_address;
  } else {
    // Fallback to Nominatim
    const nomGeo = await geocodeAddress(market);
    if (!nomGeo) {
      console.warn(`[tenant-site-search] could not geocode: ${market}`);
      return null;
    }
    lat = nomGeo.lat;
    lng = nomGeo.lng;
    resolvedName = nomGeo.matched_address;
  }

  // 2. Survey nearby businesses within 3 miles
  const radiiMeters = [THREE_MILE_RADIUS];
  let survey: SurveyResult;
  try {
    survey = await surveyNearbyBusinesses(lat, lng, gmapsKey, {
      radii: radiiMeters,
      categories: surveyCategories,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      location: resolvedName,
      lat,
      lng,
      score: 0,
      competitors_3mi: -1,
      category_status: "adequate",
      notes: `Places API error: ${msg}`,
    };
  }

  // 3. Count competitors in the target category
  let competitors3mi = 0;
  if (surveyCategories) {
    for (const cat of surveyCategories) {
      competitors3mi += survey.summary.by_category[cat] || 0;
    }
  } else {
    // No mapping: count total businesses as a rough proxy
    competitors3mi = survey.summary.total_unique;
  }

  const categoryStatus = classifyCategory(competitors3mi);

  // 4. Fetch Census demographics (population, median HHI)
  let population3mi: number | undefined;
  let medianHhi: number | undefined;

  try {
    const fips = await getCensusFips(lat, lng);
    if (fips.stateFips && fips.countyFips && fips.tractGeoid) {
      const demo = await getCensusDemographics(
        fips.tractGeoid,
        fips.stateFips,
        fips.countyFips,
      );
      // Census tract population is a proxy. For 3-mile radius, multiply
      // by an estimated coverage factor. Typical urban tract is ~1 sq mi;
      // a 3-mile radius covers ~28 sq mi, so we scale up. This is a rough
      // estimate -- the model should note it as approximate.
      population3mi = Math.round(demo.total_population * 8);
      medianHhi = demo.median_household_income;
    }
  } catch (err) {
    console.warn(`[tenant-site-search] census lookup failed for ${market}:`, err);
  }

  // 5. Build notes
  const notesParts: string[] = [];

  if (args.max_competitors_3mi != null && competitors3mi > args.max_competitors_3mi) {
    notesParts.push(
      `Exceeds competitor limit: ${competitors3mi} vs max ${args.max_competitors_3mi}`,
    );
  }
  if (args.min_population_3mi && population3mi != null && population3mi < args.min_population_3mi) {
    notesParts.push(
      `Below population minimum: ~${population3mi.toLocaleString()} vs ${args.min_population_3mi.toLocaleString()} required`,
    );
  }
  if (args.min_median_hhi && medianHhi != null && medianHhi < args.min_median_hhi) {
    notesParts.push(
      `Below income minimum: $${medianHhi.toLocaleString()} vs $${args.min_median_hhi.toLocaleString()} required`,
    );
  }
  if (categoryStatus === "void") {
    notesParts.push(`No ${category} competitors found within 3 miles`);
  } else if (categoryStatus === "underserved") {
    notesParts.push(`Only ${competitors3mi} ${category} competitor(s) within 3 miles`);
  }

  // List top competitors by name if any exist
  if (surveyCategories && competitors3mi > 0) {
    const competitorNames: string[] = [];
    for (const cat of surveyCategories) {
      const businesses = survey.by_category[cat] || [];
      for (const b of businesses.slice(0, 5)) {
        competitorNames.push(b.name);
      }
    }
    if (competitorNames.length > 0) {
      notesParts.push(`Nearby competitors: ${competitorNames.join(", ")}`);
    }
  }

  // 6. Score
  const score = scoreLocation({
    competitors: competitors3mi,
    maxCompetitors: args.max_competitors_3mi,
    population: population3mi,
    minPopulation: args.min_population_3mi,
    medianHhi,
    minHhi: args.min_median_hhi,
    categoryStatus,
  });

  return {
    location: resolvedName,
    lat,
    lng,
    score,
    population_3mi: population3mi,
    competitors_3mi: competitors3mi,
    median_hhi: medianHhi,
    category_status: categoryStatus,
    notes: notesParts.join(". ") || "Meets criteria",
  };
}
