// lib/site-scan/enrichment/census.ts
// ACS 5-year demographic profile by census tract.

const CENSUS_API_BASE = "https://api.census.gov/data";

export interface DemographicProfile {
  total_population: number;
  median_household_income: number;
  median_age: number;
  average_household_size: number;
  owner_occupied_pct: number;
  labor_force_participation_rate?: number;
  unemployment_rate?: number;
  median_commute_minutes?: number;
  bachelor_degree_plus_pct?: number;
  median_home_value?: number;
  population_density_per_sq_mi?: number;
  daytime_population?: number;
}

// ACS variable codes
const ACS_VARS = [
  "B01003_001E", // total pop
  "B19013_001E", // median HHI
  "B01002_001E", // median age
  "B25010_001E", // avg household size
  "B25003_002E", // owner-occupied units
  "B25003_001E", // total occupied units
  "B23025_003E", // labor force
  "B23025_001E", // pop 16+
  "B23025_005E", // unemployed
  "B15003_022E", // bachelor's degree
  "B15003_001E", // pop 25+
  "B25077_001E", // median home value
].join(",");

export async function getCensusDemographics(
  censusTract: string,
  state: string,
  county: string,
): Promise<DemographicProfile> {
  const apiKey = process.env.CENSUS_API_KEY;
  const year = "2023"; // latest ACS 5-year
  const tractPart = censusTract.slice(-6);
  const url =
    `${CENSUS_API_BASE}/${year}/acs/acs5?get=${ACS_VARS}` +
    `&for=tract:${tractPart}` +
    `&in=state:${state}&in=county:${county}` +
    (apiKey ? `&key=${apiKey}` : "");

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(`Census API returned ${res.status}`);
  }
  const json = await res.json();
  if (!json[1]) {
    throw new Error("No census data for this tract");
  }
  const vals = json[1];

  const pop = Number(vals[0]) || 0;
  const ownerOcc = Number(vals[4]) || 0;
  const totalOcc = Number(vals[5]) || 0;
  const laborForce = Number(vals[6]) || 0;
  const pop16plus = Number(vals[7]) || 0;
  const unemployed = Number(vals[8]) || 0;
  const bachelors = Number(vals[9]) || 0;
  const pop25plus = Number(vals[10]) || 0;

  return {
    total_population: pop,
    median_household_income: Number(vals[1]) || 0,
    median_age: Number(vals[2]) || 0,
    average_household_size: Number(vals[3]) || 0,
    owner_occupied_pct: totalOcc
      ? Math.round((ownerOcc / totalOcc) * 100)
      : 0,
    labor_force_participation_rate: pop16plus
      ? Math.round((laborForce / pop16plus) * 100)
      : undefined,
    unemployment_rate: laborForce
      ? Math.round((unemployed / laborForce) * 100)
      : undefined,
    bachelor_degree_plus_pct: pop25plus
      ? Math.round((bachelors / pop25plus) * 100)
      : undefined,
    median_home_value: Number(vals[11]) || undefined,
  };
}
