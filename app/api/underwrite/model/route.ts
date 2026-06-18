// app/api/underwrite/model/route.ts
//
// POST { input: DCFInput, sources?: Record<string,string> } and get
// back the multi-tab Excel underwriting model. `sources` maps
// DCFInput field paths (e.g. "income.gross_potential_rent") to a
// provenance string; anything not provided is recorded as an analyst
// input on the Model Sources tab.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { type DCFInput } from "@/lib/underwriting/dcf-math";
import { buildDcfWorkbook, modelFilename, type ModelSource } from "@/lib/underwriting/dcf-workbook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validate(input: unknown): string | null {
  if (!input || typeof input !== "object") return "Missing model input.";
  const b = input as Record<string, unknown>;
  const prop = b.property as Record<string, unknown> | undefined;
  if (!prop || typeof prop.name !== "string" || !prop.name.trim()) return "Property name is required.";
  if (!num(prop.sf) || prop.sf <= 0) return "Property square footage must be greater than zero.";
  const a = b.assumptions as Record<string, unknown> | undefined;
  if (!a) return "Assumptions are required.";
  for (const k of [
    "analysis_period_years",
    "discount_rate",
    "terminal_cap_rate",
    "rent_growth_rate",
    "expense_growth_rate",
    "vacancy_rate",
    "selling_costs",
  ]) {
    if (!num(a[k])) return `Assumption "${k}" must be a number.`;
  }
  if ((a.analysis_period_years as number) < 1 || (a.analysis_period_years as number) > 30) {
    return "Analysis period must be between 1 and 30 years.";
  }
  const inc = b.income as Record<string, unknown> | undefined;
  if (!inc || !num(inc.gross_potential_rent)) return "Gross Potential Rent is required.";
  const exp = b.expenses as Record<string, unknown> | undefined;
  if (!exp || !num(exp.operating_expenses)) return "Operating Expenses are required.";
  return null;
}

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

function buildSources(input: DCFInput, provided: Record<string, string>): ModelSource[] {
  const rows: ModelSource[] = [];
  const add = (path: string, label: string, value: string) => {
    rows.push({ input: label, value, source: provided[path] || "Analyst input" });
  };

  add("property.name", "Property Name", input.property.name);
  add("property.address", "Address", input.property.address || "--");
  add("property.sf", "Total Square Footage", input.property.sf.toLocaleString("en-US"));
  if (input.property.units != null) add("property.units", "Total Units", String(input.property.units));
  if (input.property.year_built != null) add("property.year_built", "Year Built", String(input.property.year_built));

  add("assumptions.analysis_period_years", "Analysis Period (Years)", String(input.assumptions.analysis_period_years));
  add("assumptions.discount_rate", "Discount Rate", fmtPct(input.assumptions.discount_rate));
  add("assumptions.terminal_cap_rate", "Terminal Cap Rate", fmtPct(input.assumptions.terminal_cap_rate));
  add("assumptions.rent_growth_rate", "Annual Rent Growth", fmtPct(input.assumptions.rent_growth_rate));
  add("assumptions.expense_growth_rate", "Annual Expense Growth", fmtPct(input.assumptions.expense_growth_rate));
  add("assumptions.vacancy_rate", "Vacancy & Collection Loss", fmtPct(input.assumptions.vacancy_rate));
  add("assumptions.selling_costs", "Selling Costs", fmtPct(input.assumptions.selling_costs));

  add("income.gross_potential_rent", "Gross Potential Rent", fmtUSD(input.income.gross_potential_rent));
  add("income.other_income", "Other Income", fmtUSD(input.income.other_income ?? 0));
  add("income.reimbursements", "Reimbursements", fmtUSD(input.income.reimbursements ?? 0));

  add("expenses.operating_expenses", "Operating Expenses", fmtUSD(input.expenses.operating_expenses));
  add("expenses.management_fee", "Management Fee", fmtUSD(input.expenses.management_fee ?? 0));
  add("expenses.insurance", "Insurance", fmtUSD(input.expenses.insurance ?? 0));
  add("expenses.taxes", "Real Estate Taxes", fmtUSD(input.expenses.taxes ?? 0));
  add("expenses.reserves", "Reserves", fmtUSD(input.expenses.reserves ?? 0));

  if (input.acquisition?.purchase_price != null) {
    add("acquisition.purchase_price", "Purchase Price", fmtUSD(input.acquisition.purchase_price));
    add("acquisition.closing_costs", "Closing Costs", fmtUSD(input.acquisition.closing_costs ?? 0));
    add("acquisition.capex_budget", "Capital Expenditure Budget", fmtUSD(input.acquisition.capex_budget ?? 0));
  }

  return rows;
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const input = b.input as DCFInput | undefined;
  const err = validate(input);
  if (err || !input) return NextResponse.json({ error: err ?? "Invalid input" }, { status: 400 });

  const provided = (b.sources && typeof b.sources === "object" ? b.sources : {}) as Record<string, string>;
  const sources = buildSources(input, provided);

  const buf = buildDcfWorkbook(input, sources);

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${modelFilename(input.property.name)}"`,
    },
  });
}
