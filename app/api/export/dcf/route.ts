import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DCFInput {
  property: {
    name: string;
    address: string;
    sf: number;
    units?: number;
    year_built?: number;
  };
  assumptions: {
    analysis_period_years: number;
    discount_rate: number;
    terminal_cap_rate: number;
    rent_growth_rate: number;
    expense_growth_rate: number;
    vacancy_rate: number;
    selling_costs: number;
  };
  income: {
    gross_potential_rent: number;
    other_income?: number;
    reimbursements?: number;
  };
  expenses: {
    operating_expenses: number;
    management_fee?: number;
    reserves?: number;
    insurance?: number;
    taxes?: number;
  };
  acquisition?: {
    purchase_price?: number;
    closing_costs?: number;
    capex_budget?: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to n decimal places. */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Apply a compound growth rate for a given year index (0-based). */
function grow(base: number, rate: number, year: number): number {
  return round(base * Math.pow(1 + rate, year), 2);
}

/**
 * Compute IRR using Newton-Raphson iteration.
 * cashFlows[0] is typically negative (the investment).
 */
function computeIRR(cashFlows: number[], guess = 0.1, maxIter = 200, tolerance = 1e-7): number | null {
  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dNpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashFlows[t] / denom;
      if (t > 0) {
        dNpv -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
      }
    }
    if (Math.abs(dNpv) < 1e-14) return null;
    const next = rate - npv / dNpv;
    if (Math.abs(next - rate) < tolerance) return round(next, 4);
    rate = next;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Projection engine
// ---------------------------------------------------------------------------

interface YearProjection {
  year: number;
  gpr: number;
  otherIncome: number;
  reimbursements: number;
  vacancy: number;
  egi: number;
  opex: number;
  management: number;
  insurance: number;
  taxes: number;
  reserves: number;
  totalExpenses: number;
  noi: number;
}

function projectCashFlows(input: DCFInput): YearProjection[] {
  const { assumptions, income, expenses } = input;
  const years: YearProjection[] = [];

  for (let y = 0; y < assumptions.analysis_period_years; y++) {
    const gpr = grow(income.gross_potential_rent, assumptions.rent_growth_rate, y);
    const otherIncome = grow(income.other_income ?? 0, assumptions.rent_growth_rate, y);
    const reimbursements = grow(income.reimbursements ?? 0, assumptions.rent_growth_rate, y);
    const vacancy = round(gpr * assumptions.vacancy_rate, 2);
    const egi = round(gpr + otherIncome + reimbursements - vacancy, 2);

    const opex = grow(expenses.operating_expenses, assumptions.expense_growth_rate, y);
    const management = grow(expenses.management_fee ?? 0, assumptions.expense_growth_rate, y);
    const insurance = grow(expenses.insurance ?? 0, assumptions.expense_growth_rate, y);
    const taxes = grow(expenses.taxes ?? 0, assumptions.expense_growth_rate, y);
    const reserves = grow(expenses.reserves ?? 0, assumptions.expense_growth_rate, y);
    const totalExpenses = round(opex + management + insurance + taxes + reserves, 2);
    const noi = round(egi - totalExpenses, 2);

    years.push({
      year: y + 1,
      gpr,
      otherIncome,
      reimbursements,
      vacancy,
      egi,
      opex,
      management,
      insurance,
      taxes,
      reserves,
      totalExpenses,
      noi,
    });
  }
  return years;
}

// ---------------------------------------------------------------------------
// Cell styling helpers (xlsx community edition workaround)
// ---------------------------------------------------------------------------

/**
 * Since xlsx (SheetJS community edition) has limited styling support,
 * we use number formats and column widths to approximate Argus formatting.
 * For bold headers we set cell types explicitly.
 */
function setCellNumberFormat(ws: XLSX.WorkSheet, cellRef: string, fmt: string) {
  if (ws[cellRef]) {
    ws[cellRef].z = fmt;
  }
}

// ---------------------------------------------------------------------------
// Sheet 1: Assumptions
// ---------------------------------------------------------------------------

function buildAssumptionsSheet(input: DCFInput): XLSX.WorkSheet {
  const { property, assumptions, income, expenses, acquisition } = input;
  const rows: (string | number | undefined)[][] = [];

  rows.push(["DISCOUNTED CASH FLOW ANALYSIS"]);
  rows.push([]);
  rows.push(["PROPERTY INFORMATION"]);
  rows.push(["Property Name", property.name]);
  rows.push(["Address", property.address]);
  rows.push(["Total Square Footage", property.sf]);
  if (property.units != null) rows.push(["Total Units", property.units]);
  if (property.year_built != null) rows.push(["Year Built", property.year_built]);
  rows.push([]);

  rows.push(["ANALYSIS ASSUMPTIONS"]);
  rows.push(["Analysis Period (Years)", assumptions.analysis_period_years]);
  rows.push(["Discount Rate", assumptions.discount_rate]);
  rows.push(["Terminal Cap Rate", assumptions.terminal_cap_rate]);
  rows.push(["Annual Rent Growth", assumptions.rent_growth_rate]);
  rows.push(["Annual Expense Growth", assumptions.expense_growth_rate]);
  rows.push(["Vacancy & Collection Loss", assumptions.vacancy_rate]);
  rows.push(["Selling Costs", assumptions.selling_costs]);
  rows.push([]);

  rows.push(["YEAR 1 INCOME"]);
  rows.push(["Gross Potential Rent", income.gross_potential_rent]);
  rows.push(["Other Income", income.other_income ?? 0]);
  rows.push(["Reimbursements", income.reimbursements ?? 0]);
  rows.push([]);

  rows.push(["YEAR 1 EXPENSES"]);
  rows.push(["Operating Expenses", expenses.operating_expenses]);
  rows.push(["Management Fee", expenses.management_fee ?? 0]);
  rows.push(["Insurance", expenses.insurance ?? 0]);
  rows.push(["Real Estate Taxes", expenses.taxes ?? 0]);
  rows.push(["Reserves", expenses.reserves ?? 0]);

  if (acquisition) {
    rows.push([]);
    rows.push(["ACQUISITION"]);
    if (acquisition.purchase_price != null)
      rows.push(["Purchase Price", acquisition.purchase_price]);
    if (acquisition.closing_costs != null)
      rows.push(["Closing Costs", acquisition.closing_costs]);
    if (acquisition.capex_budget != null)
      rows.push(["Capital Expenditure Budget", acquisition.capex_budget]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 30 }, { wch: 22 }];

  // Apply percentage formats to assumption rate cells
  // Rows are 0-indexed in the aoa; we need to find the row offsets.
  // The assumption section starts after property info.
  // We'll iterate all cells in column B and format rates vs currency.
  const rateLabels = new Set([
    "Discount Rate",
    "Terminal Cap Rate",
    "Annual Rent Growth",
    "Annual Expense Growth",
    "Vacancy & Collection Loss",
    "Selling Costs",
  ]);
  const currencyLabels = new Set([
    "Gross Potential Rent",
    "Other Income",
    "Reimbursements",
    "Operating Expenses",
    "Management Fee",
    "Insurance",
    "Real Estate Taxes",
    "Reserves",
    "Purchase Price",
    "Closing Costs",
    "Capital Expenditure Budget",
  ]);

  for (let r = 0; r < rows.length; r++) {
    const label = rows[r][0];
    const cellRef = XLSX.utils.encode_cell({ r, c: 1 });
    if (typeof label === "string" && rateLabels.has(label)) {
      setCellNumberFormat(ws, cellRef, "0.00%");
    } else if (typeof label === "string" && currencyLabels.has(label)) {
      setCellNumberFormat(ws, cellRef, "$#,##0");
    } else if (label === "Total Square Footage") {
      setCellNumberFormat(ws, cellRef, "#,##0");
    }
  }

  return ws;
}

// ---------------------------------------------------------------------------
// Sheet 2: Cash Flow Projection
// ---------------------------------------------------------------------------

function buildCashFlowSheet(input: DCFInput, projections: YearProjection[]): XLSX.WorkSheet {
  const { assumptions, property } = input;
  const n = assumptions.analysis_period_years;

  // Reversion values
  const lastNOI = projections[n - 1].noi;
  const yearNPlus1NOI = grow(lastNOI, assumptions.rent_growth_rate, 1);
  const grossReversion = round(yearNPlus1NOI / assumptions.terminal_cap_rate, 2);
  const sellingCostAmt = round(grossReversion * assumptions.selling_costs, 2);
  const netReversion = round(grossReversion - sellingCostAmt, 2);

  // PV calculations
  let pvCashFlows = 0;
  for (let i = 0; i < n; i++) {
    pvCashFlows += projections[i].noi / Math.pow(1 + assumptions.discount_rate, i + 1);
  }
  pvCashFlows = round(pvCashFlows, 2);

  const pvReversion = round(netReversion / Math.pow(1 + assumptions.discount_rate, n), 2);
  const indicatedValue = round(pvCashFlows + pvReversion, 2);
  const valuePerSF = round(indicatedValue / property.sf, 2);
  const impliedCapRate = round(projections[0].noi / indicatedValue, 4);

  // Build rows
  const header: (string | number)[] = [""];
  for (let y = 1; y <= n; y++) header.push(`Year ${y}`);
  header.push("Reversion");

  const rows: (string | number | undefined)[][] = [];
  rows.push(["CASH FLOW PROJECTION"]);
  rows.push([]);
  rows.push(header);
  rows.push([]);

  // REVENUE section
  rows.push(buildSectionRow("REVENUE", n));
  rows.push(buildDataRow("  Gross Potential Rent", projections.map((p) => p.gpr), n));
  rows.push(buildDataRow("  Other Income", projections.map((p) => p.otherIncome), n));
  rows.push(buildDataRow("  Reimbursements", projections.map((p) => p.reimbursements), n));
  rows.push(buildDataRow("  Less: Vacancy", projections.map((p) => -p.vacancy), n));
  rows.push(buildSeparatorRow(n));
  rows.push(buildDataRow("  Effective Gross Income", projections.map((p) => p.egi), n));
  rows.push([]);

  // EXPENSES section
  rows.push(buildSectionRow("EXPENSES", n));
  rows.push(buildDataRow("  Operating Expenses", projections.map((p) => p.opex), n));
  rows.push(buildDataRow("  Management Fee", projections.map((p) => p.management), n));
  rows.push(buildDataRow("  Insurance", projections.map((p) => p.insurance), n));
  rows.push(buildDataRow("  Real Estate Taxes", projections.map((p) => p.taxes), n));
  rows.push(buildDataRow("  Reserves", projections.map((p) => p.reserves), n));
  rows.push(buildSeparatorRow(n));
  rows.push(buildDataRow("  Total Expenses", projections.map((p) => p.totalExpenses), n));
  rows.push([]);

  // NOI
  rows.push(buildSeparatorRow(n));
  rows.push(buildDataRow("NET OPERATING INCOME", projections.map((p) => p.noi), n));
  rows.push(buildSeparatorRow(n));
  rows.push([]);

  // REVERSION ANALYSIS
  rows.push(buildSectionRow("REVERSION ANALYSIS", n));
  const revRow1 = buildEmptyRow("  Year N+1 NOI", n);
  revRow1.push(yearNPlus1NOI);
  rows.push(revRow1);
  const revRow2 = buildEmptyRow("  Terminal Cap Rate", n);
  revRow2.push(assumptions.terminal_cap_rate);
  rows.push(revRow2);
  const revRow3 = buildEmptyRow("  Gross Reversion Value", n);
  revRow3.push(grossReversion);
  rows.push(revRow3);
  const revRow4 = buildEmptyRow("  Less: Selling Costs", n);
  revRow4.push(-sellingCostAmt);
  rows.push(revRow4);
  rows.push(buildSeparatorRow(n + 1)); // +1 for reversion column
  const revRow5 = buildEmptyRow("  Net Reversion Value", n);
  revRow5.push(netReversion);
  rows.push(revRow5);
  rows.push([]);

  // VALUATION
  rows.push(buildSectionRow("VALUATION", n));
  rows.push(buildSingleValueRow("  PV of Cash Flows", pvCashFlows));
  rows.push(buildSingleValueRow("  PV of Reversion", pvReversion));
  rows.push(buildSeparatorRow(2));
  rows.push(buildSingleValueRow("  Indicated Value", indicatedValue));
  rows.push(buildSingleValueRow("  Value Per SF", valuePerSF));
  rows.push(buildSingleValueRow("  Implied Going-In Cap Rate", impliedCapRate));

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  const cols: XLSX.ColInfo[] = [{ wch: 28 }];
  for (let c = 0; c <= n; c++) cols.push({ wch: 16 });
  ws["!cols"] = cols;

  // Apply number formats to all data cells
  for (let r = 0; r < rows.length; r++) {
    const label = (rows[r][0] ?? "").toString().trim();
    for (let c = 1; c < rows[r].length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (ws[cellRef] && typeof ws[cellRef].v === "number") {
        if (label === "Terminal Cap Rate" || label === "Implied Going-In Cap Rate") {
          setCellNumberFormat(ws, cellRef, "0.00%");
        } else {
          setCellNumberFormat(ws, cellRef, "$#,##0");
        }
      }
    }
  }

  return ws;
}

function buildSectionRow(label: string, cols: number): (string | undefined)[] {
  const row: (string | undefined)[] = [label];
  for (let i = 0; i < cols; i++) row.push(undefined);
  return row;
}

function buildDataRow(label: string, values: number[], cols: number): (string | number)[] {
  const row: (string | number)[] = [label];
  for (let i = 0; i < cols; i++) {
    row.push(values[i] ?? 0);
  }
  return row;
}

function buildEmptyRow(label: string, cols: number): (string | number | undefined)[] {
  const row: (string | number | undefined)[] = [label];
  for (let i = 0; i < cols; i++) row.push(undefined);
  return row;
}

function buildSingleValueRow(label: string, value: number): (string | number)[] {
  return [label, value];
}

function buildSeparatorRow(cols: number): (string | undefined)[] {
  const row: (string | undefined)[] = [""];
  for (let i = 0; i < cols; i++) row.push(undefined);
  return row;
}

// ---------------------------------------------------------------------------
// Sheet 3: Returns Analysis (only if acquisition data present)
// ---------------------------------------------------------------------------

function buildReturnsSheet(
  input: DCFInput,
  projections: YearProjection[],
  indicatedValue: number,
  netReversion: number,
): XLSX.WorkSheet | null {
  const { acquisition, assumptions } = input;
  if (!acquisition || acquisition.purchase_price == null) return null;

  const purchasePrice = acquisition.purchase_price;
  const closingCosts = acquisition.closing_costs ?? 0;
  const capex = acquisition.capex_budget ?? 0;
  const totalAcquisition = round(purchasePrice + closingCosts + capex, 2);
  const year1NOI = projections[0].noi;
  const goingInCap = round(year1NOI / purchasePrice, 4);
  const cashOnCash = round(year1NOI / totalAcquisition, 4);

  // IRR: initial outflow = -totalAcquisition, then annual NOIs, final year includes net reversion
  const irrFlows: number[] = [-totalAcquisition];
  for (let i = 0; i < projections.length; i++) {
    if (i === projections.length - 1) {
      irrFlows.push(projections[i].noi + netReversion);
    } else {
      irrFlows.push(projections[i].noi);
    }
  }
  const irr = computeIRR(irrFlows);

  // Total cash received
  let totalCashReceived = 0;
  for (const p of projections) totalCashReceived += p.noi;
  totalCashReceived += netReversion;
  const equityMultiple = round(totalCashReceived / totalAcquisition, 2);

  const rows: (string | number | undefined)[][] = [];
  rows.push(["RETURNS ANALYSIS"]);
  rows.push([]);
  rows.push(["Purchase Price", purchasePrice]);
  rows.push(["Closing Costs", closingCosts]);
  rows.push(["Capital Expenditure Budget", capex]);
  rows.push(["Total Acquisition Cost", totalAcquisition]);
  rows.push([]);
  rows.push(["Year 1 NOI", year1NOI]);
  rows.push(["Going-in Cap Rate", goingInCap]);
  rows.push(["Cash-on-Cash Return", cashOnCash]);
  rows.push(["IRR (Unlevered)", irr ?? "N/A"]);
  rows.push(["Equity Multiple", equityMultiple !== null ? `${equityMultiple}x` : "N/A"]);
  rows.push([]);
  rows.push(["Total Cash Received", totalCashReceived]);
  rows.push(["Indicated Value (DCF)", indicatedValue]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 30 }, { wch: 22 }];

  // Apply formats
  const currencyLabels = new Set([
    "Purchase Price",
    "Closing Costs",
    "Capital Expenditure Budget",
    "Total Acquisition Cost",
    "Year 1 NOI",
    "Total Cash Received",
    "Indicated Value (DCF)",
  ]);
  const pctLabels = new Set([
    "Going-in Cap Rate",
    "Cash-on-Cash Return",
    "IRR (Unlevered)",
  ]);

  for (let r = 0; r < rows.length; r++) {
    const label = rows[r][0];
    const cellRef = XLSX.utils.encode_cell({ r, c: 1 });
    if (typeof label === "string" && currencyLabels.has(label)) {
      setCellNumberFormat(ws, cellRef, "$#,##0");
    } else if (typeof label === "string" && pctLabels.has(label) && ws[cellRef] && typeof ws[cellRef].v === "number") {
      setCellNumberFormat(ws, cellRef, "0.00%");
    }
  }

  return ws;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateInput(body: unknown): { valid: true; data: DCFInput } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  // Property
  if (!b.property || typeof b.property !== "object") {
    return { valid: false, error: "Missing required field: property" };
  }
  const prop = b.property as Record<string, unknown>;
  if (!prop.name || typeof prop.name !== "string") {
    return { valid: false, error: "Missing required field: property.name" };
  }
  if (!prop.address || typeof prop.address !== "string") {
    return { valid: false, error: "Missing required field: property.address" };
  }
  if (typeof prop.sf !== "number" || prop.sf <= 0) {
    return { valid: false, error: "property.sf must be a positive number" };
  }

  // Assumptions
  if (!b.assumptions || typeof b.assumptions !== "object") {
    return { valid: false, error: "Missing required field: assumptions" };
  }
  const a = b.assumptions as Record<string, unknown>;
  const requiredAssumptions = [
    "analysis_period_years",
    "discount_rate",
    "terminal_cap_rate",
    "rent_growth_rate",
    "expense_growth_rate",
    "vacancy_rate",
    "selling_costs",
  ];
  for (const key of requiredAssumptions) {
    if (typeof a[key] !== "number") {
      return { valid: false, error: `Missing or invalid required field: assumptions.${key}` };
    }
  }
  if ((a.analysis_period_years as number) < 1 || (a.analysis_period_years as number) > 30) {
    return { valid: false, error: "assumptions.analysis_period_years must be between 1 and 30" };
  }

  // Income
  if (!b.income || typeof b.income !== "object") {
    return { valid: false, error: "Missing required field: income" };
  }
  const inc = b.income as Record<string, unknown>;
  if (typeof inc.gross_potential_rent !== "number") {
    return { valid: false, error: "Missing required field: income.gross_potential_rent" };
  }

  // Expenses
  if (!b.expenses || typeof b.expenses !== "object") {
    return { valid: false, error: "Missing required field: expenses" };
  }
  const exp = b.expenses as Record<string, unknown>;
  if (typeof exp.operating_expenses !== "number") {
    return { valid: false, error: "Missing required field: expenses.operating_expenses" };
  }

  return { valid: true, data: b as unknown as DCFInput };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateInput(body);
  if (validation.valid === false) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const input = validation.data;
  const projections = projectCashFlows(input);

  // Compute reversion values needed for Returns sheet
  const n = input.assumptions.analysis_period_years;
  const lastNOI = projections[n - 1].noi;
  const yearNPlus1NOI = grow(lastNOI, input.assumptions.rent_growth_rate, 1);
  const grossReversion = round(yearNPlus1NOI / input.assumptions.terminal_cap_rate, 2);
  const sellingCostAmt = round(grossReversion * input.assumptions.selling_costs, 2);
  const netReversion = round(grossReversion - sellingCostAmt, 2);

  // Compute indicated value for Returns sheet
  let pvCashFlows = 0;
  for (let i = 0; i < n; i++) {
    pvCashFlows += projections[i].noi / Math.pow(1 + input.assumptions.discount_rate, i + 1);
  }
  pvCashFlows = round(pvCashFlows, 2);
  const pvReversion = round(netReversion / Math.pow(1 + input.assumptions.discount_rate, n), 2);
  const indicatedValue = round(pvCashFlows + pvReversion, 2);

  // Build workbook
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildAssumptionsSheet(input), "Assumptions");
  XLSX.utils.book_append_sheet(wb, buildCashFlowSheet(input, projections), "Cash Flow Projection");

  const returnsSheet = buildReturnsSheet(input, projections, indicatedValue, netReversion);
  if (returnsSheet) {
    XLSX.utils.book_append_sheet(wb, returnsSheet, "Returns Analysis");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = input.property.name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dcf-${filename}.xlsx"`,
    },
  });
}
