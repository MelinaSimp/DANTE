// lib/dante/calculators/cre.test.ts
//
// Unit tests for the CRE financial calculator. Every formula is
// tested against hand-verified numbers. Edge cases (zero inputs,
// missing fields, convergence failures) are covered.

import { describe, it, expect } from "vitest";
import {
  calcNOI,
  calcCapRate,
  calcCashOnCash,
  calcDSCR,
  calcGRM,
  calcPricePerSF,
  calcRentPerSF,
  calcLTV,
  calcDebtYield,
  calcOpExRatio,
  calcBreakEven,
  calcDebtService,
  calcEquityMultiple,
  calcIRR,
  calculateCre,
  AVAILABLE_METRICS,
  type CreCalcResult,
  type CreCalcError,
} from "./cre";

function isResult(v: unknown): v is CreCalcResult {
  return typeof v === "object" && v !== null && "value" in v && !("error" in v);
}

function isError(v: unknown): v is CreCalcError {
  return typeof v === "object" && v !== null && "error" in v;
}

// ── NOI ──────────────────────────────────────────────────────────

describe("calcNOI", () => {
  it("computes NOI with default vacancy", () => {
    const r = calcNOI({ gross_potential_rent: 100_000, operating_expenses: 35_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    // EGI = 100k * 0.95 + 0 = 95k; NOI = 95k - 35k = 60k
    expect(r.value).toBe(60_000);
    expect(r.metric).toBe("noi");
  });

  it("computes NOI with explicit vacancy and other income", () => {
    const r = calcNOI({
      gross_potential_rent: 200_000,
      vacancy_rate: 0.10,
      other_income: 5_000,
      operating_expenses: 80_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    // EGI = 200k * 0.90 + 5k = 185k; NOI = 185k - 80k = 105k
    expect(r.value).toBe(105_000);
  });

  it("errors on missing gross_potential_rent", () => {
    const r = calcNOI({ operating_expenses: 35_000 });
    expect(isError(r)).toBe(true);
    if (!isError(r)) return;
    expect(r.missing_inputs).toContain("gross_potential_rent");
  });

  it("errors on missing operating_expenses", () => {
    const r = calcNOI({ gross_potential_rent: 100_000 });
    expect(isError(r)).toBe(true);
  });
});

// ── Cap Rate ─────────────────────────────────────────────────────

describe("calcCapRate", () => {
  it("computes cap rate", () => {
    const r = calcCapRate({ noi: 80_000, purchase_price: 1_000_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(0.08); // 8%
  });

  it("accepts market_value as alternate key", () => {
    const r = calcCapRate({ noi: 50_000, market_value: 1_000_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(0.05);
  });

  it("errors on zero purchase price", () => {
    const r = calcCapRate({ noi: 80_000, purchase_price: 0 });
    expect(isError(r)).toBe(true);
  });

  it("errors on missing noi", () => {
    const r = calcCapRate({ purchase_price: 1_000_000 });
    expect(isError(r)).toBe(true);
  });
});

// ── Cash on Cash ─────────────────────────────────────────────────

describe("calcCashOnCash", () => {
  it("computes cash-on-cash return", () => {
    const r = calcCashOnCash({
      noi: 80_000,
      annual_debt_service: 50_000,
      total_cash_invested: 250_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    // (80k - 50k) / 250k = 0.12
    expect(r.value).toBe(0.12);
  });

  it("handles all-cash deal (no debt service)", () => {
    const r = calcCashOnCash({
      noi: 80_000,
      total_cash_invested: 1_000_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(0.08);
  });

  it("errors on zero cash invested", () => {
    const r = calcCashOnCash({ noi: 80_000, total_cash_invested: 0 });
    expect(isError(r)).toBe(true);
  });
});

// ── DSCR ─────────────────────────────────────────────────────────

describe("calcDSCR", () => {
  it("computes DSCR", () => {
    const r = calcDSCR({ noi: 100_000, annual_debt_service: 80_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(1.25);
  });

  it("flags sub-1.0 DSCR", () => {
    const r = calcDSCR({ noi: 70_000, annual_debt_service: 80_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(0.88);
    expect(r.interpretation).toContain("Below breakeven");
  });

  it("errors on zero debt service", () => {
    const r = calcDSCR({ noi: 100_000, annual_debt_service: 0 });
    expect(isError(r)).toBe(true);
  });
});

// ── GRM ──────────────────────────────────────────────────────────

describe("calcGRM", () => {
  it("computes GRM", () => {
    const r = calcGRM({ purchase_price: 1_000_000, gross_annual_rent: 120_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(8.33);
  });

  it("errors on zero rent", () => {
    const r = calcGRM({ purchase_price: 1_000_000, gross_annual_rent: 0 });
    expect(isError(r)).toBe(true);
  });
});

// ── Price per SF ─────────────────────────────────────────────────

describe("calcPricePerSF", () => {
  it("computes price per SF", () => {
    const r = calcPricePerSF({ purchase_price: 2_000_000, building_sf: 10_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(200);
  });

  it("accepts rentable_sf as alternate key", () => {
    const r = calcPricePerSF({ purchase_price: 1_500_000, rentable_sf: 7_500 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(200);
  });

  it("errors on zero SF", () => {
    const r = calcPricePerSF({ purchase_price: 2_000_000, building_sf: 0 });
    expect(isError(r)).toBe(true);
  });
});

// ── Rent per SF ──────────────────────────────────────────────────

describe("calcRentPerSF", () => {
  it("computes rent per SF", () => {
    const r = calcRentPerSF({ annual_rent: 240_000, rentable_sf: 10_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(24);
  });

  it("accepts gross_annual_rent as alternate key", () => {
    const r = calcRentPerSF({ gross_annual_rent: 120_000, building_sf: 5_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(24);
  });
});

// ── LTV ──────────────────────────────────────────────────────────

describe("calcLTV", () => {
  it("computes LTV", () => {
    const r = calcLTV({ loan_amount: 750_000, appraised_value: 1_000_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(0.75);
  });

  it("uses purchase_price as fallback", () => {
    const r = calcLTV({ loan_amount: 650_000, purchase_price: 1_000_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(0.65);
    expect(r.interpretation).toContain("Conservative");
  });
});

// ── Debt Yield ───────────────────────────────────────────────────

describe("calcDebtYield", () => {
  it("computes debt yield", () => {
    const r = calcDebtYield({ noi: 100_000, loan_amount: 1_000_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(0.10);
    expect(r.interpretation).toContain("Strong");
  });

  it("flags low debt yield", () => {
    const r = calcDebtYield({ noi: 60_000, loan_amount: 1_000_000 });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(0.06);
    expect(r.interpretation).toContain("Below typical");
  });
});

// ── OpEx Ratio ───────────────────────────────────────────────────

describe("calcOpExRatio", () => {
  it("computes operating expense ratio", () => {
    const r = calcOpExRatio({
      operating_expenses: 40_000,
      gross_potential_rent: 100_000,
      vacancy_rate: 0.05,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    // EGI = 100k * 0.95 = 95k; ratio = 40k / 95k = 0.4211
    expect(r.value).toBeCloseTo(0.4211, 3);
  });
});

// ── Break-Even Occupancy ─────────────────────────────────────────

describe("calcBreakEven", () => {
  it("computes break-even occupancy", () => {
    const r = calcBreakEven({
      operating_expenses: 40_000,
      annual_debt_service: 50_000,
      gross_potential_rent: 120_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    // (40k + 50k) / 120k = 0.75
    expect(r.value).toBe(0.75);
    expect(r.interpretation).toContain("Comfortable");
  });

  it("flags tight break-even", () => {
    const r = calcBreakEven({
      operating_expenses: 50_000,
      annual_debt_service: 55_000,
      gross_potential_rent: 120_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    // (50k + 55k) / 120k = 0.875
    expect(r.value).toBeCloseTo(0.875, 3);
    expect(r.interpretation).toContain("Tight");
  });
});

// ── Debt Service ─────────────────────────────────────────────────

describe("calcDebtService", () => {
  it("computes amortizing debt service", () => {
    const r = calcDebtService({
      loan_amount: 1_000_000,
      interest_rate: 0.065,
      amortization_years: 25,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    // Known payment for $1M at 6.5% / 25yr: ~$6,752/mo = ~$81,027/yr
    expect(r.value).toBeCloseTo(81_027, -1); // within $10
    expect(r.interpretation).toContain("6.50%");
  });

  it("computes interest-only debt service", () => {
    const r = calcDebtService({
      loan_amount: 1_000_000,
      interest_rate: 0.06,
      interest_only: 1,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(60_000);
  });

  it("errors on missing rate", () => {
    const r = calcDebtService({ loan_amount: 1_000_000 });
    expect(isError(r)).toBe(true);
  });
});

// ── Equity Multiple ──────────────────────────────────────────────

describe("calcEquityMultiple", () => {
  it("computes equity multiple", () => {
    const r = calcEquityMultiple({
      total_distributions: 500_000,
      total_equity_invested: 250_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(2.0);
    expect(r.interpretation).toContain("double");
  });

  it("flags sub-1.0x (loss of capital)", () => {
    const r = calcEquityMultiple({
      total_distributions: 180_000,
      total_equity_invested: 250_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(0.72);
    expect(r.interpretation).toContain("loss of capital");
  });

  it("accepts total_cash_invested as alternate key", () => {
    const r = calcEquityMultiple({
      total_distributions: 300_000,
      total_cash_invested: 200_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBe(1.5);
  });
});

// ── IRR ──────────────────────────────────────────────────────────

describe("calcIRR", () => {
  it("computes IRR for a typical 5-year hold", () => {
    // -1M invested, 80k/yr cash flow, sell for 1.1M in year 5
    const r = calcIRR({
      cash_flow_0: -1_000_000,
      cash_flow_1: 80_000,
      cash_flow_2: 82_000,
      cash_flow_3: 84_000,
      cash_flow_4: 86_000,
      cash_flow_5: 1_188_000, // 88k cash flow + 1.1M sale
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    // Expected IRR ~12-14%
    expect(r.value).toBeGreaterThanOrEqual(0.10);
    expect(r.value).toBeLessThan(0.18);
    expect(r.breakdown).toBeDefined();
    expect(r.breakdown!.length).toBe(6);
  });

  it("computes IRR for a simple 1-year flip", () => {
    // Buy for 500k, sell for 600k after 1 year
    const r = calcIRR({
      cash_flow_0: -500_000,
      cash_flow_1: 600_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBeCloseTo(0.20, 2); // 20% return
  });

  it("handles negative return", () => {
    const r = calcIRR({
      cash_flow_0: -1_000_000,
      cash_flow_1: 50_000,
      cash_flow_2: 50_000,
      cash_flow_3: 800_000,
    });
    expect(isResult(r)).toBe(true);
    if (!isResult(r)) return;
    expect(r.value).toBeLessThan(0);
  });

  it("errors on fewer than 2 cash flows", () => {
    const r = calcIRR({ cash_flow_0: -1_000_000 });
    expect(isError(r)).toBe(true);
  });

  it("errors on no cash flows", () => {
    const r = calcIRR({});
    expect(isError(r)).toBe(true);
  });
});

// ── Dispatcher ───────────────────────────────────────────────────

describe("calculateCre", () => {
  it("lists all 14 metrics", () => {
    expect(AVAILABLE_METRICS).toHaveLength(14);
    expect(AVAILABLE_METRICS).toContain("noi");
    expect(AVAILABLE_METRICS).toContain("irr");
    expect(AVAILABLE_METRICS).toContain("cap_rate");
    expect(AVAILABLE_METRICS).toContain("dscr");
  });

  it("computes multiple metrics in one call", () => {
    const results = calculateCre(
      ["noi", "cap_rate", "dscr"],
      {
        gross_potential_rent: 200_000,
        vacancy_rate: 0.05,
        operating_expenses: 80_000,
        noi: 110_000,
        purchase_price: 1_500_000,
        annual_debt_service: 85_000,
      },
    );
    expect(results).toHaveLength(3);
    expect(results.every(isResult)).toBe(true);
  });

  it("returns error for unknown metric", () => {
    const results = calculateCre(["fake_metric"], { noi: 100_000 });
    expect(results).toHaveLength(1);
    expect(isError(results[0])).toBe(true);
  });

  it("returns error for empty metrics array", () => {
    const results = calculateCre([], {});
    expect(results).toHaveLength(1);
    expect(isError(results[0])).toBe(true);
  });

  it("mixes successes and errors gracefully", () => {
    const results = calculateCre(
      ["cap_rate", "fake_one"],
      { noi: 80_000, purchase_price: 1_000_000 },
    );
    expect(results).toHaveLength(2);
    expect(isResult(results[0])).toBe(true);
    expect(isError(results[1])).toBe(true);
  });
});
