// lib/dante/calculators/cre.ts
//
// Pure-math CRE financial calculator. Every function is stateless,
// deterministic, and free of side effects -- no DB, no network.
//
// The agent tool `cre.calculate` calls `calculateCre()` with a
// metric name and inputs. Results include the formula used so the
// model can show its work in the response.
//
// Formulas follow standard CRE underwriting conventions:
//   - CREFC / CREF textbook definitions
//   - Annual periods unless noted
//   - All currency in dollars (no cents scaling)

// ── Types ────────────────────────────────────────────────────────

export interface CreCalcResult {
  metric: string;
  value: number;
  /** Human-readable formula string, e.g. "NOI / Purchase Price" */
  formula: string;
  /** Plain-English interpretation */
  interpretation: string;
  inputs_used: Record<string, number>;
  /** Optional breakdown rows (e.g. year-by-year for IRR) */
  breakdown?: Record<string, number>[];
}

export interface CreCalcError {
  error: string;
  metric: string;
  missing_inputs?: string[];
}

export type CreCalcOutput = CreCalcResult | CreCalcError;

// ── Individual calculators ───────────────────────────────────────

/**
 * Net Operating Income = Effective Gross Income - Operating Expenses
 * EGI = Gross Potential Rent - Vacancy Loss + Other Income
 */
export function calcNOI(inputs: Record<string, number>): CreCalcOutput {
  const gpr = inputs.gross_potential_rent;
  const vacancy = inputs.vacancy_rate ?? 0.05; // default 5%
  const otherIncome = inputs.other_income ?? 0;
  const opex = inputs.operating_expenses;

  if (gpr == null) return { error: "gross_potential_rent is required", metric: "noi", missing_inputs: ["gross_potential_rent"] };
  if (opex == null) return { error: "operating_expenses is required", metric: "noi", missing_inputs: ["operating_expenses"] };

  const egi = gpr * (1 - vacancy) + otherIncome;
  const noi = egi - opex;

  return {
    metric: "noi",
    value: Math.round(noi * 100) / 100,
    formula: "(Gross Potential Rent * (1 - Vacancy Rate) + Other Income) - Operating Expenses",
    interpretation: `Net Operating Income is $${noi.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per year.`,
    inputs_used: { gross_potential_rent: gpr, vacancy_rate: vacancy, other_income: otherIncome, operating_expenses: opex },
  };
}

/**
 * Cap Rate = NOI / Purchase Price (or Current Market Value)
 */
export function calcCapRate(inputs: Record<string, number>): CreCalcOutput {
  const noi = inputs.noi;
  const price = inputs.purchase_price ?? inputs.market_value;

  if (noi == null) return { error: "noi is required", metric: "cap_rate", missing_inputs: ["noi"] };
  if (price == null) return { error: "purchase_price or market_value is required", metric: "cap_rate", missing_inputs: ["purchase_price"] };
  if (price === 0) return { error: "purchase_price cannot be zero", metric: "cap_rate" };

  const capRate = noi / price;

  return {
    metric: "cap_rate",
    value: Math.round(capRate * 10000) / 10000, // 4 decimal places for percentage
    formula: "NOI / Purchase Price",
    interpretation: `Cap rate is ${(capRate * 100).toFixed(2)}%. ${capRate >= 0.08 ? "Higher yield, potentially higher risk." : capRate >= 0.05 ? "Moderate yield, typical for stabilized assets." : "Lower yield, often indicates lower risk or premium location."}`,
    inputs_used: { noi, purchase_price: price },
  };
}

/**
 * Cash-on-Cash Return = Annual Pre-Tax Cash Flow / Total Cash Invested
 * Pre-tax cash flow = NOI - Annual Debt Service
 */
export function calcCashOnCash(inputs: Record<string, number>): CreCalcOutput {
  const noi = inputs.noi;
  const annualDebtService = inputs.annual_debt_service ?? 0;
  const totalCashInvested = inputs.total_cash_invested;

  if (noi == null) return { error: "noi is required", metric: "cash_on_cash", missing_inputs: ["noi"] };
  if (totalCashInvested == null) return { error: "total_cash_invested is required (down payment + closing costs + capex)", metric: "cash_on_cash", missing_inputs: ["total_cash_invested"] };
  if (totalCashInvested === 0) return { error: "total_cash_invested cannot be zero", metric: "cash_on_cash" };

  const preTaxCashFlow = noi - annualDebtService;
  const coc = preTaxCashFlow / totalCashInvested;

  return {
    metric: "cash_on_cash",
    value: Math.round(coc * 10000) / 10000,
    formula: "(NOI - Annual Debt Service) / Total Cash Invested",
    interpretation: `Cash-on-cash return is ${(coc * 100).toFixed(2)}%. Annual pre-tax cash flow of $${preTaxCashFlow.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on $${totalCashInvested.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} invested.`,
    inputs_used: { noi, annual_debt_service: annualDebtService, total_cash_invested: totalCashInvested },
  };
}

/**
 * DSCR = NOI / Annual Debt Service
 * Lenders typically want >= 1.20-1.25
 */
export function calcDSCR(inputs: Record<string, number>): CreCalcOutput {
  const noi = inputs.noi;
  const annualDebtService = inputs.annual_debt_service;

  if (noi == null) return { error: "noi is required", metric: "dscr", missing_inputs: ["noi"] };
  if (annualDebtService == null) return { error: "annual_debt_service is required", metric: "dscr", missing_inputs: ["annual_debt_service"] };
  if (annualDebtService === 0) return { error: "annual_debt_service cannot be zero (all-cash deal has no DSCR)", metric: "dscr" };

  const dscr = noi / annualDebtService;

  return {
    metric: "dscr",
    value: Math.round(dscr * 100) / 100,
    formula: "NOI / Annual Debt Service",
    interpretation: `DSCR is ${dscr.toFixed(2)}x. ${dscr >= 1.25 ? "Meets most lender requirements." : dscr >= 1.0 ? "Marginal -- many lenders require 1.20-1.25x minimum." : "Below breakeven -- debt service exceeds NOI."}`,
    inputs_used: { noi, annual_debt_service: annualDebtService },
  };
}

/**
 * GRM = Purchase Price / Gross Annual Rent
 * Quick screening metric; lower = potentially better value.
 */
export function calcGRM(inputs: Record<string, number>): CreCalcOutput {
  const price = inputs.purchase_price ?? inputs.market_value;
  const grossRent = inputs.gross_annual_rent;

  if (price == null) return { error: "purchase_price is required", metric: "grm", missing_inputs: ["purchase_price"] };
  if (grossRent == null) return { error: "gross_annual_rent is required", metric: "grm", missing_inputs: ["gross_annual_rent"] };
  if (grossRent === 0) return { error: "gross_annual_rent cannot be zero", metric: "grm" };

  const grm = price / grossRent;

  return {
    metric: "grm",
    value: Math.round(grm * 100) / 100,
    formula: "Purchase Price / Gross Annual Rent",
    interpretation: `GRM is ${grm.toFixed(2)}. At current rent, the property takes ~${Math.ceil(grm)} years of gross rent to equal the purchase price.`,
    inputs_used: { purchase_price: price, gross_annual_rent: grossRent },
  };
}

/**
 * Price per Square Foot = Purchase Price / Building SF
 */
export function calcPricePerSF(inputs: Record<string, number>): CreCalcOutput {
  const price = inputs.purchase_price ?? inputs.market_value;
  const sf = inputs.building_sf ?? inputs.rentable_sf;

  if (price == null) return { error: "purchase_price is required", metric: "price_per_sf", missing_inputs: ["purchase_price"] };
  if (sf == null) return { error: "building_sf is required", metric: "price_per_sf", missing_inputs: ["building_sf"] };
  if (sf === 0) return { error: "building_sf cannot be zero", metric: "price_per_sf" };

  const ppsf = price / sf;

  return {
    metric: "price_per_sf",
    value: Math.round(ppsf * 100) / 100,
    formula: "Purchase Price / Building SF",
    interpretation: `$${ppsf.toFixed(2)} per square foot for ${sf.toLocaleString()} SF.`,
    inputs_used: { purchase_price: price, building_sf: sf },
  };
}

/**
 * Rent per Square Foot = Annual Rent / Rentable SF
 */
export function calcRentPerSF(inputs: Record<string, number>): CreCalcOutput {
  const rent = inputs.annual_rent ?? inputs.gross_annual_rent;
  const sf = inputs.rentable_sf ?? inputs.building_sf;

  if (rent == null) return { error: "annual_rent is required", metric: "rent_per_sf", missing_inputs: ["annual_rent"] };
  if (sf == null) return { error: "rentable_sf is required", metric: "rent_per_sf", missing_inputs: ["rentable_sf"] };
  if (sf === 0) return { error: "rentable_sf cannot be zero", metric: "rent_per_sf" };

  const rpsf = rent / sf;

  return {
    metric: "rent_per_sf",
    value: Math.round(rpsf * 100) / 100,
    formula: "Annual Rent / Rentable SF",
    interpretation: `$${rpsf.toFixed(2)} per SF per year ($${(rpsf / 12).toFixed(2)}/SF/month).`,
    inputs_used: { annual_rent: rent, rentable_sf: sf },
  };
}

/**
 * Loan-to-Value = Loan Amount / Appraised Value (or Purchase Price)
 */
export function calcLTV(inputs: Record<string, number>): CreCalcOutput {
  const loan = inputs.loan_amount;
  const value = inputs.appraised_value ?? inputs.purchase_price ?? inputs.market_value;

  if (loan == null) return { error: "loan_amount is required", metric: "ltv", missing_inputs: ["loan_amount"] };
  if (value == null) return { error: "appraised_value or purchase_price is required", metric: "ltv", missing_inputs: ["appraised_value"] };
  if (value === 0) return { error: "property value cannot be zero", metric: "ltv" };

  const ltv = loan / value;

  return {
    metric: "ltv",
    value: Math.round(ltv * 10000) / 10000,
    formula: "Loan Amount / Appraised Value",
    interpretation: `LTV is ${(ltv * 100).toFixed(1)}%. ${ltv <= 0.65 ? "Conservative leverage." : ltv <= 0.75 ? "Standard commercial range." : "Aggressive -- may face higher rate or require recourse."}`,
    inputs_used: { loan_amount: loan, appraised_value: value },
  };
}

/**
 * Debt Yield = NOI / Loan Amount
 * Lender metric; typically want >= 8-10%
 */
export function calcDebtYield(inputs: Record<string, number>): CreCalcOutput {
  const noi = inputs.noi;
  const loan = inputs.loan_amount;

  if (noi == null) return { error: "noi is required", metric: "debt_yield", missing_inputs: ["noi"] };
  if (loan == null) return { error: "loan_amount is required", metric: "debt_yield", missing_inputs: ["loan_amount"] };
  if (loan === 0) return { error: "loan_amount cannot be zero", metric: "debt_yield" };

  const dy = noi / loan;

  return {
    metric: "debt_yield",
    value: Math.round(dy * 10000) / 10000,
    formula: "NOI / Loan Amount",
    interpretation: `Debt yield is ${(dy * 100).toFixed(2)}%. ${dy >= 0.10 ? "Strong -- meets most lender thresholds." : dy >= 0.08 ? "Acceptable for many CRE lenders." : "Below typical minimums; lender may require more equity."}`,
    inputs_used: { noi, loan_amount: loan },
  };
}

/**
 * Operating Expense Ratio = Operating Expenses / EGI
 */
export function calcOpExRatio(inputs: Record<string, number>): CreCalcOutput {
  const opex = inputs.operating_expenses;
  const gpr = inputs.gross_potential_rent;
  const vacancy = inputs.vacancy_rate ?? 0.05;
  const otherIncome = inputs.other_income ?? 0;

  if (opex == null) return { error: "operating_expenses is required", metric: "opex_ratio", missing_inputs: ["operating_expenses"] };
  if (gpr == null) return { error: "gross_potential_rent is required", metric: "opex_ratio", missing_inputs: ["gross_potential_rent"] };

  const egi = gpr * (1 - vacancy) + otherIncome;
  if (egi === 0) return { error: "effective gross income is zero", metric: "opex_ratio" };

  const ratio = opex / egi;

  return {
    metric: "opex_ratio",
    value: Math.round(ratio * 10000) / 10000,
    formula: "Operating Expenses / Effective Gross Income",
    interpretation: `OpEx ratio is ${(ratio * 100).toFixed(1)}%. ${ratio <= 0.35 ? "Efficient -- typical for NNN or low-maintenance." : ratio <= 0.50 ? "Normal range for full-service or multi-tenant." : "High -- investigate line items for savings."}`,
    inputs_used: { operating_expenses: opex, gross_potential_rent: gpr, vacancy_rate: vacancy, other_income: otherIncome },
  };
}

/**
 * Break-Even Occupancy = (Operating Expenses + Debt Service) / Gross Potential Rent
 * The minimum occupancy needed to cover all costs.
 */
export function calcBreakEven(inputs: Record<string, number>): CreCalcOutput {
  const opex = inputs.operating_expenses;
  const debtService = inputs.annual_debt_service ?? 0;
  const gpr = inputs.gross_potential_rent;

  if (opex == null) return { error: "operating_expenses is required", metric: "break_even_occupancy", missing_inputs: ["operating_expenses"] };
  if (gpr == null) return { error: "gross_potential_rent is required", metric: "break_even_occupancy", missing_inputs: ["gross_potential_rent"] };
  if (gpr === 0) return { error: "gross_potential_rent cannot be zero", metric: "break_even_occupancy" };

  const beo = (opex + debtService) / gpr;

  return {
    metric: "break_even_occupancy",
    value: Math.round(beo * 10000) / 10000,
    formula: "(Operating Expenses + Annual Debt Service) / Gross Potential Rent",
    interpretation: `Break-even at ${(beo * 100).toFixed(1)}% occupancy. ${beo <= 0.75 ? "Comfortable cushion." : beo <= 0.85 ? "Moderate -- sensitive to vacancy." : "Tight -- small vacancy increase causes negative cash flow."}`,
    inputs_used: { operating_expenses: opex, annual_debt_service: debtService, gross_potential_rent: gpr },
  };
}

/**
 * Annual Debt Service from loan terms.
 * Standard amortizing mortgage: P&I payment * 12.
 * Monthly P&I = P * [r(1+r)^n] / [(1+r)^n - 1]
 */
export function calcDebtService(inputs: Record<string, number>): CreCalcOutput {
  const principal = inputs.loan_amount;
  const annualRate = inputs.interest_rate; // decimal, e.g. 0.065 for 6.5%
  const amortYears = inputs.amortization_years ?? 25;

  if (principal == null) return { error: "loan_amount is required", metric: "debt_service", missing_inputs: ["loan_amount"] };
  if (annualRate == null) return { error: "interest_rate is required (decimal, e.g. 0.065 for 6.5%)", metric: "debt_service", missing_inputs: ["interest_rate"] };

  // Interest-only edge case
  if (inputs.interest_only) {
    const annual = principal * annualRate;
    return {
      metric: "debt_service",
      value: Math.round(annual * 100) / 100,
      formula: "Loan Amount * Interest Rate (interest-only)",
      interpretation: `Interest-only annual debt service: $${annual.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ($${(annual / 12).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month).`,
      inputs_used: { loan_amount: principal, interest_rate: annualRate, interest_only: 1 },
    };
  }

  const r = annualRate / 12; // monthly rate
  const n = amortYears * 12; // total payments
  const monthlyPayment = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const annualDS = monthlyPayment * 12;

  return {
    metric: "debt_service",
    value: Math.round(annualDS * 100) / 100,
    formula: "P * [r(1+r)^n / ((1+r)^n - 1)] * 12",
    interpretation: `Annual debt service: $${annualDS.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ($${monthlyPayment.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month) on a ${amortYears}-year amortization at ${(annualRate * 100).toFixed(2)}%.`,
    inputs_used: { loan_amount: principal, interest_rate: annualRate, amortization_years: amortYears },
  };
}

/**
 * Equity Multiple = Total Distributions / Total Equity Invested
 * Requires projected hold period, annual cash flows, and reversion.
 */
export function calcEquityMultiple(inputs: Record<string, number>): CreCalcOutput {
  const totalDistributions = inputs.total_distributions;
  const totalEquity = inputs.total_equity_invested ?? inputs.total_cash_invested;

  if (totalDistributions == null) return { error: "total_distributions is required (sum of all cash flows + sale proceeds)", metric: "equity_multiple", missing_inputs: ["total_distributions"] };
  if (totalEquity == null) return { error: "total_equity_invested is required", metric: "equity_multiple", missing_inputs: ["total_equity_invested"] };
  if (totalEquity === 0) return { error: "total_equity_invested cannot be zero", metric: "equity_multiple" };

  const em = totalDistributions / totalEquity;

  return {
    metric: "equity_multiple",
    value: Math.round(em * 100) / 100,
    formula: "Total Distributions / Total Equity Invested",
    interpretation: `Equity multiple of ${em.toFixed(2)}x. ${em >= 2.0 ? "Strong return -- investors double their money." : em >= 1.5 ? "Solid return." : em >= 1.0 ? "Capital returned but modest profit." : "Below 1.0x -- projected loss of capital."}`,
    inputs_used: { total_distributions: totalDistributions, total_equity_invested: totalEquity },
  };
}

/**
 * Simple IRR approximation using Newton's method.
 * cash_flows: array where index 0 = initial investment (negative),
 * subsequent = annual net cash flows, last = includes reversion.
 *
 * For the agent tool, the caller passes these as cash_flow_0,
 * cash_flow_1, etc. We assemble the array here.
 */
export function calcIRR(inputs: Record<string, number>): CreCalcOutput {
  // Assemble cash flow array from numbered keys
  const cashFlows: number[] = [];
  let i = 0;
  while (inputs[`cash_flow_${i}`] != null) {
    cashFlows.push(inputs[`cash_flow_${i}`]);
    i++;
  }

  if (cashFlows.length < 2) {
    return {
      error: "At least 2 cash flows required (cash_flow_0 = initial investment as negative, cash_flow_1+ = annual returns). Last period should include sale proceeds.",
      metric: "irr",
      missing_inputs: ["cash_flow_0", "cash_flow_1"],
    };
  }

  // Newton-Raphson IRR solver
  let rate = 0.10; // initial guess
  const maxIter = 200;
  const tolerance = 1e-8;

  for (let iter = 0; iter < maxIter; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashFlows[t] / denom;
      if (t > 0) dnpv -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(dnpv) < 1e-14) break; // avoid division by zero
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < tolerance) {
      rate = newRate;
      break;
    }
    rate = newRate;
  }

  // Verify convergence
  let checkNpv = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    checkNpv += cashFlows[t] / Math.pow(1 + rate, t);
  }

  if (Math.abs(checkNpv) > 1) {
    return { error: "IRR calculation did not converge. Check cash flows -- there may be no real solution.", metric: "irr" };
  }

  const cfMap: Record<string, number> = {};
  cashFlows.forEach((cf, idx) => { cfMap[`cash_flow_${idx}`] = cf; });

  const breakdown = cashFlows.map((cf, idx) => ({
    year: idx,
    cash_flow: cf,
    pv_at_irr: Math.round(cf / Math.pow(1 + rate, idx) * 100) / 100,
  }));

  return {
    metric: "irr",
    value: Math.round(rate * 10000) / 10000,
    formula: "Rate where NPV of all cash flows = 0 (Newton-Raphson)",
    interpretation: `IRR is ${(rate * 100).toFixed(2)}% over a ${cashFlows.length - 1}-year hold. ${rate >= 0.15 ? "Strong risk-adjusted return." : rate >= 0.08 ? "Moderate return -- typical for stabilized CRE." : "Below typical CRE hurdle rates."}`,
    inputs_used: cfMap,
    breakdown,
  };
}

/**
 * Deal Score — composite 0-100 score for a potential acquisition.
 *
 * Evaluates up to 7 dimensions, each weighted:
 *   - Cap rate vs target (20%)
 *   - DSCR (15%)
 *   - Cash-on-cash return (15%)
 *   - LTV (10%)
 *   - Break-even occupancy (15%)
 *   - Debt yield (10%)
 *   - OpEx ratio (15%)
 *
 * Each dimension scores 0-100 based on where the value falls
 * relative to good/acceptable/poor thresholds. Missing dimensions
 * are excluded and weights are redistributed.
 */
export function calcDealScore(inputs: Record<string, number>): CreCalcOutput {
  interface Dimension {
    name: string;
    weight: number;
    value: number | null;
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    note: string;
  }

  const dimensions: Dimension[] = [];

  // Helper to score a value on a scale
  function grade(
    val: number,
    thresholds: { a: number; b: number; c: number; d: number },
    higher_is_better: boolean,
  ): { score: number; grade: "A" | "B" | "C" | "D" | "F" } {
    const compare = higher_is_better
      ? (v: number, t: number) => v >= t
      : (v: number, t: number) => v <= t;
    if (compare(val, thresholds.a)) return { score: 95, grade: "A" };
    if (compare(val, thresholds.b)) return { score: 80, grade: "B" };
    if (compare(val, thresholds.c)) return { score: 60, grade: "C" };
    if (compare(val, thresholds.d)) return { score: 40, grade: "D" };
    return { score: 20, grade: "F" };
  }

  // Cap rate
  if (inputs.noi != null && (inputs.purchase_price ?? inputs.market_value) != null) {
    const price = inputs.purchase_price ?? inputs.market_value;
    const capRate = inputs.noi / price;
    const targetCap = inputs.target_cap_rate ?? 0.07;
    const diff = capRate - targetCap;
    const g = grade(diff, { a: 0.01, b: 0, c: -0.01, d: -0.02 }, true);
    dimensions.push({
      name: "Cap rate",
      weight: 20,
      value: capRate,
      score: g.score,
      grade: g.grade,
      note: `${(capRate * 100).toFixed(2)}% vs ${(targetCap * 100).toFixed(2)}% target`,
    });
  }

  // DSCR
  if (inputs.noi != null && inputs.annual_debt_service != null && inputs.annual_debt_service > 0) {
    const dscr = inputs.noi / inputs.annual_debt_service;
    const g = grade(dscr, { a: 1.50, b: 1.25, c: 1.10, d: 1.0 }, true);
    dimensions.push({
      name: "DSCR",
      weight: 15,
      value: dscr,
      score: g.score,
      grade: g.grade,
      note: `${dscr.toFixed(2)}x coverage`,
    });
  }

  // Cash-on-cash
  if (
    inputs.noi != null &&
    (inputs.total_cash_invested ?? inputs.total_equity_invested) != null
  ) {
    const equity = inputs.total_cash_invested ?? inputs.total_equity_invested;
    const ds = inputs.annual_debt_service ?? 0;
    const coc = (inputs.noi - ds) / equity;
    const g = grade(coc, { a: 0.12, b: 0.08, c: 0.05, d: 0.02 }, true);
    dimensions.push({
      name: "Cash-on-cash",
      weight: 15,
      value: coc,
      score: g.score,
      grade: g.grade,
      note: `${(coc * 100).toFixed(2)}% return`,
    });
  }

  // LTV
  if (inputs.loan_amount != null && (inputs.purchase_price ?? inputs.market_value) != null) {
    const value = inputs.appraised_value ?? inputs.purchase_price ?? inputs.market_value;
    const ltv = inputs.loan_amount / value;
    const g = grade(ltv, { a: 0.60, b: 0.70, c: 0.75, d: 0.80 }, false);
    dimensions.push({
      name: "LTV",
      weight: 10,
      value: ltv,
      score: g.score,
      grade: g.grade,
      note: `${(ltv * 100).toFixed(1)}% leverage`,
    });
  }

  // Break-even occupancy
  if (inputs.operating_expenses != null && inputs.gross_potential_rent != null) {
    const ds = inputs.annual_debt_service ?? 0;
    const beo = (inputs.operating_expenses + ds) / inputs.gross_potential_rent;
    const g = grade(beo, { a: 0.70, b: 0.80, c: 0.85, d: 0.90 }, false);
    dimensions.push({
      name: "Break-even",
      weight: 15,
      value: beo,
      score: g.score,
      grade: g.grade,
      note: `${(beo * 100).toFixed(1)}% occupancy needed`,
    });
  }

  // Debt yield
  if (inputs.noi != null && inputs.loan_amount != null && inputs.loan_amount > 0) {
    const dy = inputs.noi / inputs.loan_amount;
    const g = grade(dy, { a: 0.12, b: 0.10, c: 0.08, d: 0.06 }, true);
    dimensions.push({
      name: "Debt yield",
      weight: 10,
      value: dy,
      score: g.score,
      grade: g.grade,
      note: `${(dy * 100).toFixed(2)}%`,
    });
  }

  // OpEx ratio
  if (inputs.operating_expenses != null && inputs.gross_potential_rent != null) {
    const vacancy = inputs.vacancy_rate ?? 0.05;
    const egi = inputs.gross_potential_rent * (1 - vacancy) + (inputs.other_income ?? 0);
    if (egi > 0) {
      const ratio = inputs.operating_expenses / egi;
      const g = grade(ratio, { a: 0.30, b: 0.40, c: 0.50, d: 0.60 }, false);
      dimensions.push({
        name: "OpEx ratio",
        weight: 15,
        value: ratio,
        score: g.score,
        grade: g.grade,
        note: `${(ratio * 100).toFixed(1)}% of EGI`,
      });
    }
  }

  if (dimensions.length === 0) {
    return {
      error: "Not enough inputs to score. Provide at least noi and purchase_price.",
      metric: "deal_score",
      missing_inputs: ["noi", "purchase_price"],
    };
  }

  // Redistribute weights across available dimensions
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const compositeScore = Math.round(
    dimensions.reduce((s, d) => s + (d.score * d.weight) / totalWeight, 0),
  );

  const overallGrade: "A" | "B" | "C" | "D" | "F" =
    compositeScore >= 90 ? "A"
    : compositeScore >= 75 ? "B"
    : compositeScore >= 60 ? "C"
    : compositeScore >= 40 ? "D"
    : "F";

  const breakdown = dimensions.map((d) => ({
    dimension: d.name,
    score: d.score,
    grade: d.grade,
    weight_pct: Math.round((d.weight / totalWeight) * 100),
    note: d.note,
  }));

  return {
    metric: "deal_score",
    value: compositeScore,
    formula: "Weighted composite of cap rate, DSCR, CoC, LTV, break-even, debt yield, OpEx ratio",
    interpretation: `Deal scores ${compositeScore}/100 (${overallGrade}). ${
      compositeScore >= 80
        ? "Strong acquisition candidate."
        : compositeScore >= 60
          ? "Acceptable with caveats -- review weak dimensions."
          : "Below threshold -- significant concerns in key metrics."
    } Evaluated ${dimensions.length} of 7 dimensions.`,
    inputs_used: Object.fromEntries(
      Object.entries(inputs).filter(([, v]) => v != null),
    ),
    breakdown: breakdown as unknown as Record<string, number>[],
  };
}

// ── Dispatcher ───────────────────────────────────────────────────

const METRIC_MAP: Record<string, (inputs: Record<string, number>) => CreCalcOutput> = {
  noi: calcNOI,
  cap_rate: calcCapRate,
  cash_on_cash: calcCashOnCash,
  dscr: calcDSCR,
  grm: calcGRM,
  price_per_sf: calcPricePerSF,
  rent_per_sf: calcRentPerSF,
  ltv: calcLTV,
  debt_yield: calcDebtYield,
  opex_ratio: calcOpExRatio,
  break_even_occupancy: calcBreakEven,
  debt_service: calcDebtService,
  equity_multiple: calcEquityMultiple,
  irr: calcIRR,
  deal_score: calcDealScore,
};

export const AVAILABLE_METRICS = Object.keys(METRIC_MAP);

/**
 * Calculate one or more CRE metrics. When `metrics` contains
 * multiple names, all are computed against the same inputs and
 * returned together -- this lets the agent run a full due-diligence
 * battery in a single tool call.
 */
export function calculateCre(
  metrics: string[],
  inputs: Record<string, number>,
): CreCalcOutput[] {
  if (metrics.length === 0) {
    return [{ error: "No metrics specified. Available: " + AVAILABLE_METRICS.join(", "), metric: "none" }];
  }

  return metrics.map((m) => {
    const fn = METRIC_MAP[m];
    if (!fn) {
      return { error: `Unknown metric "${m}". Available: ${AVAILABLE_METRICS.join(", ")}`, metric: m };
    }
    return fn(inputs);
  });
}
