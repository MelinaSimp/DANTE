import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface VoidAnalysisData {
  site: {
    address: string;
    lat?: number;
    lng?: number;
    zoning?: string;
    acreage?: number;
    assessed_value?: number;
  };
  demographics?: {
    population_1mi?: number;
    population_3mi?: number;
    households_3mi?: number;
    median_hhi?: number;
    median_age?: number;
    daytime_pop?: number;
    owner_occupancy?: number;
  };
  categories: Array<{
    name: string;
    count_1mi: number;
    count_3mi: number;
    threshold: number;
    status: "void" | "underserved" | "adequate" | "saturated";
  }>;
  voids: Array<{
    category: string;
    count_3mi: number;
    evidence: string;
    opportunity_level: "HIGH" | "MEDIUM" | "LOW";
    demand_met: boolean;
    recommended_tenants?: Array<{
      brand: string;
      sf_requirement?: string;
      rationale?: string;
      verified_absent: boolean;
    }>;
  }>;
  rent_comps?: Array<{
    type: string;
    low: number;
    mid: number;
    high: number;
  }>;
  accessed_at?: string;
}

function buildSiteOverview(data: VoidAnalysisData): XLSX.WorkSheet {
  const rows: (string | number | undefined)[][] = [];

  rows.push(["Void Analysis Report"]);
  rows.push([data.site.address]);
  rows.push([
    data.site.zoning ? `Zoning: ${data.site.zoning}` : undefined,
    data.site.acreage != null ? `Acreage: ${data.site.acreage}` : undefined,
    data.site.assessed_value != null
      ? `Assessed Value: $${data.site.assessed_value.toLocaleString()}`
      : undefined,
  ]);
  rows.push([]); // blank row 4
  rows.push(["Demographics"]);

  if (data.demographics) {
    const d = data.demographics;
    if (d.population_1mi != null)
      rows.push(["Population (1mi)", d.population_1mi]);
    if (d.population_3mi != null)
      rows.push(["Population (3mi)", d.population_3mi]);
    if (d.households_3mi != null)
      rows.push(["Households (3mi)", d.households_3mi]);
    if (d.median_hhi != null) rows.push(["Median HHI", d.median_hhi]);
    if (d.median_age != null) rows.push(["Median Age", d.median_age]);
    if (d.daytime_pop != null) rows.push(["Daytime Pop", d.daytime_pop]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 24 }];
  return ws;
}

function buildCategoryDensity(data: VoidAnalysisData): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ["Category", "Count (1mi)", "Count (3mi)", "Threshold", "Status"],
  ];

  for (const cat of data.categories) {
    rows.push([cat.name, cat.count_1mi, cat.count_3mi, cat.threshold, cat.status]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];
  return ws;
}

function buildIdentifiedVoids(data: VoidAnalysisData): XLSX.WorkSheet {
  const rows: (string | number | boolean)[][] = [
    ["Category", "Count (3mi)", "Opportunity Level", "Demand Met", "Evidence"],
  ];

  for (const v of data.voids) {
    rows.push([v.category, v.count_3mi, v.opportunity_level, v.demand_met ? "Yes" : "No", v.evidence]);

    if (v.recommended_tenants && v.recommended_tenants.length > 0) {
      rows.push(["", "Brand", "SF Requirement", "Verified Absent", "Rationale"]);
      for (const t of v.recommended_tenants) {
        rows.push([
          "",
          t.brand,
          t.sf_requirement ?? "",
          t.verified_absent ? "Yes" : "No",
          t.rationale ?? "",
        ]);
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 40 },
  ];
  return ws;
}

function buildRentComps(data: VoidAnalysisData): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ["Type", "Low ($/SF)", "Mid ($/SF)", "High ($/SF)"],
  ];

  if (data.rent_comps) {
    for (const rc of data.rent_comps) {
      rows.push([rc.type, rc.low, rc.mid, rc.high]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  return ws;
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { data?: VoidAnalysisData };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.data) {
    return NextResponse.json({ error: "No data provided" }, { status: 400 });
  }

  const data = body.data;

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildSiteOverview(data), "Site Overview");
  XLSX.utils.book_append_sheet(wb, buildCategoryDensity(data), "Category Density");
  XLSX.utils.book_append_sheet(wb, buildIdentifiedVoids(data), "Identified Voids");
  XLSX.utils.book_append_sheet(wb, buildRentComps(data), "Rent Comps");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="void-analysis.xlsx"',
    },
  });
}
