const BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data";

export interface BlsEmploymentData {
  series_id: string;
  area_code: string;
  year: number;
  period: string;
  total_employment: number | null;
  unemployment_rate: number | null;
}

export async function fetchEmployment(
  areaCode: string,
  startYear?: number,
  endYear?: number,
): Promise<BlsEmploymentData[]> {
  const now = new Date().getFullYear();
  const sy = startYear ?? now - 1;
  const ey = endYear ?? now;

  const rateSeries = `LAUCN${areaCode}0000000003`;
  const empSeries = `LAUCN${areaCode}0000000005`;

  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seriesid: [rateSeries, empSeries],
      startyear: String(sy),
      endyear: String(ey),
    }),
  });

  if (!res.ok) return [];
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) return [];

  const json = await res.json();
  if (json.status !== "REQUEST_SUCCEEDED") return [];

  const rateData = json.Results?.series?.find(
    (s: any) => s.seriesID === rateSeries,
  )?.data ?? [];
  const empData = json.Results?.series?.find(
    (s: any) => s.seriesID === empSeries,
  )?.data ?? [];

  const empMap = new Map<string, number>();
  for (const d of empData) {
    empMap.set(`${d.year}-${d.period}`, Number(d.value));
  }

  return rateData.map((d: any) => ({
    series_id: rateSeries,
    area_code: areaCode,
    year: Number(d.year),
    period: d.period,
    unemployment_rate: Number(d.value),
    total_employment: empMap.get(`${d.year}-${d.period}`) ?? null,
  }));
}
