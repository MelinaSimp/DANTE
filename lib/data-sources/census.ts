const BASE = "https://api.census.gov/data";
const API_KEY = process.env.CENSUS_API_KEY || "";

export interface CensusAcsData {
  tract: string;
  population: number;
  median_income: number;
  median_age: number;
  total_housing_units: number;
  occupied_units: number;
  vacant_units: number;
  vacancy_rate: number;
  owner_occupied: number;
  renter_occupied: number;
}

export async function fetchAcsByTract(
  state: string,
  county: string,
  tract: string,
  year = 2023,
): Promise<CensusAcsData | null> {
  const variables = [
    "B01003_001E", // total population
    "B19013_001E", // median household income
    "B01002_001E", // median age
    "B25001_001E", // total housing units
    "B25002_002E", // occupied housing units
    "B25002_003E", // vacant housing units
    "B25003_002E", // owner-occupied
    "B25003_003E", // renter-occupied
  ].join(",");

  const keyParam = API_KEY ? `&key=${API_KEY}` : "";
  const url = `${BASE}/${year}/acs/acs5?get=${variables}&for=tract:${tract}&in=state:${state}%20county:${county}${keyParam}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) return null;

  const rows: string[][] = await res.json();
  if (!rows || rows.length < 2) return null;

  const [, vals] = rows;
  const num = (i: number) => {
    const v = Number(vals[i]);
    return isNaN(v) || v < 0 ? 0 : v;
  };

  const total_housing = num(3);
  const vacant = num(5);

  return {
    tract: `${state}${county}${tract}`,
    population: num(0),
    median_income: num(1),
    median_age: num(2),
    total_housing_units: total_housing,
    occupied_units: num(4),
    vacant_units: vacant,
    vacancy_rate: total_housing > 0 ? vacant / total_housing : 0,
    owner_occupied: num(6),
    renter_occupied: num(7),
  };
}

export async function fetchAcsByCounty(
  state: string,
  county: string,
  year = 2023,
): Promise<CensusAcsData | null> {
  const variables = [
    "B01003_001E",
    "B19013_001E",
    "B01002_001E",
    "B25001_001E",
    "B25002_002E",
    "B25002_003E",
    "B25003_002E",
    "B25003_003E",
  ].join(",");

  const keyParam = API_KEY ? `&key=${API_KEY}` : "";
  const url = `${BASE}/${year}/acs/acs5?get=${variables}&for=county:${county}&in=state:${state}${keyParam}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) return null;

  const rows: string[][] = await res.json();
  if (!rows || rows.length < 2) return null;

  const [, vals] = rows;
  const num = (i: number) => {
    const v = Number(vals[i]);
    return isNaN(v) || v < 0 ? 0 : v;
  };

  const total_housing = num(3);
  const vacant = num(5);

  return {
    tract: `${state}${county}`,
    population: num(0),
    median_income: num(1),
    median_age: num(2),
    total_housing_units: total_housing,
    occupied_units: num(4),
    vacant_units: vacant,
    vacancy_rate: total_housing > 0 ? vacant / total_housing : 0,
    owner_occupied: num(6),
    renter_occupied: num(7),
  };
}
