// lib/underwriting/dcf-math.ts
//
// Pure, deterministic DCF underwriting math. No XLSX, no I/O, no DB.
// Safe to import on both client (live preview) and server (workbook
// generation) so the numbers the broker sees on screen are computed
// by the exact same code that fills the downloadable model.
//
// Formulas follow standard CRE direct-cap + DCF conventions:
//   - Annual periods
//   - Reversion = (Year N+1 NOI) / terminal cap, net of selling costs
//   - Unlevered IRR on NOI stream + terminal net reversion

// ── Types ────────────────────────────────────────────────────────

export interface DCFInput {
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

export interface YearProjection {
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

export interface DcfReturns {
  purchasePrice: number;
  closingCosts: number;
  capex: number;
  totalAcquisitionCost: number;
  year1NOI: number;
  goingInCapRate: number;
  cashOnCash: number;
  irr: number | null;
  equityMultiple: number;
  totalCashReceived: number;
}

export interface DcfSummary {
  analysisPeriodYears: number;
  year1NOI: number;
  finalYearNOI: number;
  yearNPlus1NOI: number;
  grossReversion: number;
  sellingCostAmount: number;
  netReversion: number;
  pvCashFlows: number;
  pvReversion: number;
  indicatedValue: number;
  valuePerSF: number;
  impliedGoingInCapRate: number;
  projections: YearProjection[];
  returns: DcfReturns | null;
}

// ── Defaults ─────────────────────────────────────────────────────

export const DEFAULT_ASSUMPTIONS: DCFInput["assumptions"] = {
  analysis_period_years: 10,
  discount_rate: 0.085,
  terminal_cap_rate: 0.07,
  rent_growth_rate: 0.03,
  expense_growth_rate: 0.025,
  vacancy_rate: 0.05,
  selling_costs: 0.02,
};

// ── Helpers ──────────────────────────────────────────────────────

/** Round to n decimal places. */
export function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Compound growth for a 0-based year index. */
export function grow(base: number, rate: number, year: number): number {
  return round(base * Math.pow(1 + rate, year), 2);
}

/**
 * IRR via Newton-Raphson. cashFlows[0] is the (negative) investment.
 * Returns null if it fails to converge.
 */
export function computeIRR(
  cashFlows: number[],
  guess = 0.1,
  maxIter = 200,
  tolerance = 1e-7,
): number | null {
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

// ── Projection + summary ─────────────────────────────────────────

export function projectCashFlows(input: DCFInput): YearProjection[] {
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

/**
 * Full valuation + returns summary. Single source of truth for both
 * the on-screen preview and the generated workbook.
 */
export function computeDcfSummary(input: DCFInput): DcfSummary {
  const { assumptions, property, acquisition } = input;
  const n = Math.max(1, assumptions.analysis_period_years);
  const projections = projectCashFlows(input);

  const finalYearNOI = projections[n - 1]?.noi ?? 0;
  const yearNPlus1NOI = grow(finalYearNOI, assumptions.rent_growth_rate, 1);
  const grossReversion =
    assumptions.terminal_cap_rate > 0
      ? round(yearNPlus1NOI / assumptions.terminal_cap_rate, 2)
      : 0;
  const sellingCostAmount = round(grossReversion * assumptions.selling_costs, 2);
  const netReversion = round(grossReversion - sellingCostAmount, 2);

  let pvCashFlows = 0;
  for (let i = 0; i < n; i++) {
    pvCashFlows += projections[i].noi / Math.pow(1 + assumptions.discount_rate, i + 1);
  }
  pvCashFlows = round(pvCashFlows, 2);

  const pvReversion = round(netReversion / Math.pow(1 + assumptions.discount_rate, n), 2);
  const indicatedValue = round(pvCashFlows + pvReversion, 2);
  const valuePerSF = property.sf > 0 ? round(indicatedValue / property.sf, 2) : 0;
  const year1NOI = projections[0]?.noi ?? 0;
  const impliedGoingInCapRate = indicatedValue > 0 ? round(year1NOI / indicatedValue, 4) : 0;

  let returns: DcfReturns | null = null;
  if (acquisition && acquisition.purchase_price != null && acquisition.purchase_price > 0) {
    const purchasePrice = acquisition.purchase_price;
    const closingCosts = acquisition.closing_costs ?? 0;
    const capex = acquisition.capex_budget ?? 0;
    const totalAcquisitionCost = round(purchasePrice + closingCosts + capex, 2);
    const goingInCapRate = round(year1NOI / purchasePrice, 4);
    const cashOnCash =
      totalAcquisitionCost > 0 ? round(year1NOI / totalAcquisitionCost, 4) : 0;

    const irrFlows: number[] = [-totalAcquisitionCost];
    for (let i = 0; i < projections.length; i++) {
      irrFlows.push(
        i === projections.length - 1 ? projections[i].noi + netReversion : projections[i].noi,
      );
    }
    const irr = computeIRR(irrFlows);

    let totalCashReceived = 0;
    for (const p of projections) totalCashReceived += p.noi;
    totalCashReceived = round(totalCashReceived + netReversion, 2);
    const equityMultiple =
      totalAcquisitionCost > 0 ? round(totalCashReceived / totalAcquisitionCost, 2) : 0;

    returns = {
      purchasePrice,
      closingCosts,
      capex,
      totalAcquisitionCost,
      year1NOI,
      goingInCapRate,
      cashOnCash,
      irr,
      equityMultiple,
      totalCashReceived,
    };
  }

  return {
    analysisPeriodYears: n,
    year1NOI,
    finalYearNOI,
    yearNPlus1NOI,
    grossReversion,
    sellingCostAmount,
    netReversion,
    pvCashFlows,
    pvReversion,
    indicatedValue,
    valuePerSF,
    impliedGoingInCapRate,
    projections,
    returns,
  };
}
