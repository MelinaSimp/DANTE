// lib/underwriting/dcf-workbook.ts
//
// Server-side workbook generator. Turns a DCFInput into a multi-tab
// Excel model (Assumptions, Cash Flow Projection, Returns Analysis,
// Model Sources). All valuation numbers come from computeDcfSummary
// in dcf-math so the workbook can never drift from the on-screen
// preview.

import * as XLSX from "xlsx";
import {
  type DCFInput,
  type DcfSummary,
  type YearProjection,
  computeDcfSummary,
} from "./dcf-math";

/** One provenance row: a model input traced to where it came from. */
export interface ModelSource {
  input: string;
  value: string;
  source: string;
}

function setCellNumberFormat(ws: XLSX.WorkSheet, cellRef: string, fmt: string) {
  if (ws[cellRef]) ws[cellRef].z = fmt;
}

// ── Sheet 1: Assumptions ─────────────────────────────────────────

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
    if (acquisition.purchase_price != null) rows.push(["Purchase Price", acquisition.purchase_price]);
    if (acquisition.closing_costs != null) rows.push(["Closing Costs", acquisition.closing_costs]);
    if (acquisition.capex_budget != null) rows.push(["Capital Expenditure Budget", acquisition.capex_budget]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 30 }, { wch: 22 }];

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
    if (typeof label === "string" && rateLabels.has(label)) setCellNumberFormat(ws, cellRef, "0.00%");
    else if (typeof label === "string" && currencyLabels.has(label)) setCellNumberFormat(ws, cellRef, "$#,##0");
    else if (label === "Total Square Footage") setCellNumberFormat(ws, cellRef, "#,##0");
  }

  return ws;
}

// ── Sheet 2: Cash Flow Projection ────────────────────────────────

function sectionRow(label: string, cols: number): (string | undefined)[] {
  return [label, ...Array<undefined>(cols).fill(undefined)];
}
function dataRow(label: string, values: number[], cols: number): (string | number)[] {
  const row: (string | number)[] = [label];
  for (let i = 0; i < cols; i++) row.push(values[i] ?? 0);
  return row;
}
function emptyRow(label: string, cols: number): (string | number | undefined)[] {
  return [label, ...Array<undefined>(cols).fill(undefined)];
}
function singleValueRow(label: string, value: number): (string | number)[] {
  return [label, value];
}
function separatorRow(cols: number): (string | undefined)[] {
  return ["", ...Array<undefined>(cols).fill(undefined)];
}

function buildCashFlowSheet(
  input: DCFInput,
  projections: YearProjection[],
  summary: DcfSummary,
): XLSX.WorkSheet {
  const { assumptions } = input;
  const n = assumptions.analysis_period_years;

  const header: (string | number)[] = [""];
  for (let y = 1; y <= n; y++) header.push(`Year ${y}`);
  header.push("Reversion");

  const rows: (string | number | undefined)[][] = [];
  rows.push(["CASH FLOW PROJECTION"]);
  rows.push([]);
  rows.push(header);
  rows.push([]);

  rows.push(sectionRow("REVENUE", n));
  rows.push(dataRow("  Gross Potential Rent", projections.map((p) => p.gpr), n));
  rows.push(dataRow("  Other Income", projections.map((p) => p.otherIncome), n));
  rows.push(dataRow("  Reimbursements", projections.map((p) => p.reimbursements), n));
  rows.push(dataRow("  Less: Vacancy", projections.map((p) => -p.vacancy), n));
  rows.push(separatorRow(n));
  rows.push(dataRow("  Effective Gross Income", projections.map((p) => p.egi), n));
  rows.push([]);

  rows.push(sectionRow("EXPENSES", n));
  rows.push(dataRow("  Operating Expenses", projections.map((p) => p.opex), n));
  rows.push(dataRow("  Management Fee", projections.map((p) => p.management), n));
  rows.push(dataRow("  Insurance", projections.map((p) => p.insurance), n));
  rows.push(dataRow("  Real Estate Taxes", projections.map((p) => p.taxes), n));
  rows.push(dataRow("  Reserves", projections.map((p) => p.reserves), n));
  rows.push(separatorRow(n));
  rows.push(dataRow("  Total Expenses", projections.map((p) => p.totalExpenses), n));
  rows.push([]);

  rows.push(separatorRow(n));
  rows.push(dataRow("NET OPERATING INCOME", projections.map((p) => p.noi), n));
  rows.push(separatorRow(n));
  rows.push([]);

  rows.push(sectionRow("REVERSION ANALYSIS", n));
  const revRow1 = emptyRow("  Year N+1 NOI", n); revRow1.push(summary.yearNPlus1NOI); rows.push(revRow1);
  const revRow2 = emptyRow("  Terminal Cap Rate", n); revRow2.push(assumptions.terminal_cap_rate); rows.push(revRow2);
  const revRow3 = emptyRow("  Gross Reversion Value", n); revRow3.push(summary.grossReversion); rows.push(revRow3);
  const revRow4 = emptyRow("  Less: Selling Costs", n); revRow4.push(-summary.sellingCostAmount); rows.push(revRow4);
  rows.push(separatorRow(n + 1));
  const revRow5 = emptyRow("  Net Reversion Value", n); revRow5.push(summary.netReversion); rows.push(revRow5);
  rows.push([]);

  rows.push(sectionRow("VALUATION", n));
  rows.push(singleValueRow("  PV of Cash Flows", summary.pvCashFlows));
  rows.push(singleValueRow("  PV of Reversion", summary.pvReversion));
  rows.push(separatorRow(2));
  rows.push(singleValueRow("  Indicated Value", summary.indicatedValue));
  rows.push(singleValueRow("  Value Per SF", summary.valuePerSF));
  rows.push(singleValueRow("  Implied Going-In Cap Rate", summary.impliedGoingInCapRate));

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const cols: XLSX.ColInfo[] = [{ wch: 28 }];
  for (let c = 0; c <= n; c++) cols.push({ wch: 16 });
  ws["!cols"] = cols;

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

// ── Sheet 3: Returns Analysis ────────────────────────────────────

function buildReturnsSheet(summary: DcfSummary): XLSX.WorkSheet | null {
  const r = summary.returns;
  if (!r) return null;

  const rows: (string | number | undefined)[][] = [];
  rows.push(["RETURNS ANALYSIS"]);
  rows.push([]);
  rows.push(["Purchase Price", r.purchasePrice]);
  rows.push(["Closing Costs", r.closingCosts]);
  rows.push(["Capital Expenditure Budget", r.capex]);
  rows.push(["Total Acquisition Cost", r.totalAcquisitionCost]);
  rows.push([]);
  rows.push(["Year 1 NOI", r.year1NOI]);
  rows.push(["Going-in Cap Rate", r.goingInCapRate]);
  rows.push(["Cash-on-Cash Return", r.cashOnCash]);
  rows.push(["IRR (Unlevered)", r.irr ?? "N/A"]);
  rows.push(["Equity Multiple", `${r.equityMultiple}x`]);
  rows.push([]);
  rows.push(["Total Cash Received", r.totalCashReceived]);
  rows.push(["Indicated Value (DCF)", summary.indicatedValue]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 30 }, { wch: 22 }];

  const currencyLabels = new Set([
    "Purchase Price",
    "Closing Costs",
    "Capital Expenditure Budget",
    "Total Acquisition Cost",
    "Year 1 NOI",
    "Total Cash Received",
    "Indicated Value (DCF)",
  ]);
  const pctLabels = new Set(["Going-in Cap Rate", "Cash-on-Cash Return", "IRR (Unlevered)"]);

  for (let i = 0; i < rows.length; i++) {
    const label = rows[i][0];
    const cellRef = XLSX.utils.encode_cell({ r: i, c: 1 });
    if (typeof label === "string" && currencyLabels.has(label)) setCellNumberFormat(ws, cellRef, "$#,##0");
    else if (typeof label === "string" && pctLabels.has(label) && ws[cellRef] && typeof ws[cellRef].v === "number") {
      setCellNumberFormat(ws, cellRef, "0.00%");
    }
  }

  return ws;
}

// ── Sheet 4: Model Sources (provenance) ──────────────────────────

function buildSourcesSheet(sources: ModelSource[]): XLSX.WorkSheet {
  const rows: (string | undefined)[][] = [];
  rows.push(["MODEL SOURCES"]);
  rows.push(["Every input below is traced to its origin. Assumptions set by the analyst are marked as analyst inputs."]);
  rows.push([]);
  rows.push(["Input", "Value", "Source"]);
  for (const s of sources) rows.push([s.input, s.value, s.source]);
  rows.push([]);
  rows.push([
    "DISCLAIMER: AI-assisted underwriting model. All figures must be independently verified against source documents before use in any transaction, financing, or investment-committee decision.",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 34 }, { wch: 22 }, { wch: 64 }];
  return ws;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Build the full multi-tab workbook as bytes ready for a Response.
 * `sources` (optional) populates the Model Sources provenance tab.
 */
export function buildDcfWorkbook(input: DCFInput, sources?: ModelSource[]): Uint8Array<ArrayBuffer> {
  const summary = computeDcfSummary(input);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildAssumptionsSheet(input), "Assumptions");
  XLSX.utils.book_append_sheet(wb, buildCashFlowSheet(input, summary.projections, summary), "Cash Flow Projection");

  const returnsSheet = buildReturnsSheet(summary);
  if (returnsSheet) XLSX.utils.book_append_sheet(wb, returnsSheet, "Returns Analysis");

  if (sources && sources.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildSourcesSheet(sources), "Model Sources");
  }

  // Copy into a fresh ArrayBuffer-backed view so the bytes satisfy the
  // DOM BodyInit type (XLSX returns a generic ArrayBufferLike buffer).
  const raw = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  const body = new Uint8Array(raw.byteLength);
  body.set(raw);
  return body;
}

/** Slugify a property name for the download filename. */
export function modelFilename(propertyName: string): string {
  const slug = (propertyName || "model")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase() || "model";
  return `underwriting-${slug}.xlsx`;
}
