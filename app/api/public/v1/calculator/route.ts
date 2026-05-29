// app/api/public/v1/calculator/route.ts
//
// Phase 7 — public API: CRE financial calculations.
//
//   POST /api/public/v1/calculator
//   Authorization: Bearer drift_pat_<...>
//   Required scope: write:calculator
//   body: { metric: string, inputs: Record<string, number> }
//
// Runs a single CRE financial metric calculation using the same
// pure-math engine the agent loop uses. Stateless, no DB writes.
//
// Supported metrics: noi, cap_rate, dscr, cash_on_cash, irr, grm,
//   price_per_sf, price_per_unit, operating_expense_ratio,
//   break_even_occupancy, net_effective_rent, tenant_retention_cost,
//   lease_escalation, reversion_value, rent_per_sf, ltv, debt_yield,
//   opex_ratio, debt_service, equity_multiple
//
// Response shape:
//   { metric: string, result: number, inputs: Record<string, number> }

import { NextRequest, NextResponse } from "next/server";
import { requireApiToken } from "@/lib/auth/api-token";
import { calculateCre, AVAILABLE_METRICS, type CreCalcOutput } from "@/lib/dante/calculators/cre";

export const dynamic = "force-dynamic";

// Map requested metric aliases to the canonical names in the calculator.
// Some metric names in the spec differ from the internal keys.
const METRIC_ALIASES: Record<string, string> = {
  operating_expense_ratio: "opex_ratio",
};

// Metrics that the calculator engine supports natively.
const ENGINE_METRICS = new Set(AVAILABLE_METRICS);

// Additional metrics implemented inline below that are not in the
// core calculator module. These are simple formulas added to satisfy
// the public API contract without bloating the shared calculator.
const EXTRA_METRICS: Record<
  string,
  (inputs: Record<string, number>) => CreCalcOutput
> = {
  price_per_unit: (inputs) => {
    const price = inputs.purchase_price ?? inputs.market_value;
    const units = inputs.number_of_units;
    if (price == null)
      return { error: "purchase_price is required", metric: "price_per_unit", missing_inputs: ["purchase_price"] };
    if (units == null)
      return { error: "number_of_units is required", metric: "price_per_unit", missing_inputs: ["number_of_units"] };
    if (units === 0)
      return { error: "number_of_units cannot be zero", metric: "price_per_unit" };
    const ppu = price / units;
    return {
      metric: "price_per_unit",
      value: Math.round(ppu * 100) / 100,
      formula: "Purchase Price / Number of Units",
      interpretation: `$${ppu.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per unit across ${units} units.`,
      inputs_used: { purchase_price: price, number_of_units: units },
    };
  },

  net_effective_rent: (inputs) => {
    const baseRent = inputs.base_rent;
    const freeMonths = inputs.free_months ?? 0;
    const termMonths = inputs.lease_term_months;
    if (baseRent == null)
      return { error: "base_rent (monthly) is required", metric: "net_effective_rent", missing_inputs: ["base_rent"] };
    if (termMonths == null)
      return { error: "lease_term_months is required", metric: "net_effective_rent", missing_inputs: ["lease_term_months"] };
    if (termMonths === 0)
      return { error: "lease_term_months cannot be zero", metric: "net_effective_rent" };
    const ner = (baseRent * (termMonths - freeMonths)) / termMonths;
    return {
      metric: "net_effective_rent",
      value: Math.round(ner * 100) / 100,
      formula: "Base Rent * (Lease Term - Free Months) / Lease Term",
      interpretation: `Net effective rent is $${ner.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month after accounting for ${freeMonths} free months over a ${termMonths}-month term.`,
      inputs_used: { base_rent: baseRent, free_months: freeMonths, lease_term_months: termMonths },
    };
  },

  tenant_retention_cost: (inputs) => {
    const tiAllowance = inputs.ti_allowance ?? 0;
    const leasingCommission = inputs.leasing_commission ?? 0;
    const downtime = inputs.downtime_months ?? 0;
    const monthlyRent = inputs.monthly_rent;
    if (monthlyRent == null)
      return { error: "monthly_rent is required", metric: "tenant_retention_cost", missing_inputs: ["monthly_rent"] };
    const vacancyLoss = downtime * monthlyRent;
    const total = tiAllowance + leasingCommission + vacancyLoss;
    return {
      metric: "tenant_retention_cost",
      value: Math.round(total * 100) / 100,
      formula: "TI Allowance + Leasing Commission + (Downtime Months * Monthly Rent)",
      interpretation: `Total tenant turnover cost is $${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} including $${vacancyLoss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in vacancy loss.`,
      inputs_used: { ti_allowance: tiAllowance, leasing_commission: leasingCommission, downtime_months: downtime, monthly_rent: monthlyRent },
    };
  },

  lease_escalation: (inputs) => {
    const baseRent = inputs.base_rent;
    const escalationRate = inputs.escalation_rate;
    const year = inputs.year ?? 1;
    if (baseRent == null)
      return { error: "base_rent is required", metric: "lease_escalation", missing_inputs: ["base_rent"] };
    if (escalationRate == null)
      return { error: "escalation_rate is required (decimal, e.g. 0.03 for 3%)", metric: "lease_escalation", missing_inputs: ["escalation_rate"] };
    const escalatedRent = baseRent * Math.pow(1 + escalationRate, year);
    return {
      metric: "lease_escalation",
      value: Math.round(escalatedRent * 100) / 100,
      formula: "Base Rent * (1 + Escalation Rate) ^ Year",
      interpretation: `Rent in year ${year} is $${escalatedRent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at a ${(escalationRate * 100).toFixed(1)}% annual escalation.`,
      inputs_used: { base_rent: baseRent, escalation_rate: escalationRate, year },
    };
  },

  reversion_value: (inputs) => {
    const terminalNoi = inputs.terminal_noi;
    const exitCapRate = inputs.exit_cap_rate;
    const sellingCosts = inputs.selling_costs_pct ?? 0;
    if (terminalNoi == null)
      return { error: "terminal_noi is required", metric: "reversion_value", missing_inputs: ["terminal_noi"] };
    if (exitCapRate == null)
      return { error: "exit_cap_rate is required (decimal, e.g. 0.06 for 6%)", metric: "reversion_value", missing_inputs: ["exit_cap_rate"] };
    if (exitCapRate === 0)
      return { error: "exit_cap_rate cannot be zero", metric: "reversion_value" };
    const grossReversion = terminalNoi / exitCapRate;
    const netReversion = grossReversion * (1 - sellingCosts);
    return {
      metric: "reversion_value",
      value: Math.round(netReversion * 100) / 100,
      formula: "(Terminal NOI / Exit Cap Rate) * (1 - Selling Costs %)",
      interpretation: `Net reversion value is $${netReversion.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at a ${(exitCapRate * 100).toFixed(2)}% exit cap rate.`,
      inputs_used: { terminal_noi: terminalNoi, exit_cap_rate: exitCapRate, selling_costs_pct: sellingCosts },
    };
  },
};

interface Body {
  metric?: string;
  inputs?: Record<string, number>;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiToken(req, "write:calculator");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Body;
  const rawMetric = (body.metric || "").trim().toLowerCase();
  if (!rawMetric) {
    return NextResponse.json({ error: "metric is required" }, { status: 400 });
  }
  const inputs = body.inputs ?? {};
  if (typeof inputs !== "object" || Array.isArray(inputs)) {
    return NextResponse.json({ error: "inputs must be an object of key-value number pairs" }, { status: 400 });
  }

  // Resolve alias if one exists.
  const metric = METRIC_ALIASES[rawMetric] ?? rawMetric;

  // Try the core calculator engine first.
  if (ENGINE_METRICS.has(metric)) {
    const [result] = calculateCre([metric], inputs);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error, metric: result.metric, missing_inputs: result.missing_inputs ?? null },
        { status: 422 },
      );
    }
    return NextResponse.json({
      metric: result.metric,
      result: result.value,
      inputs: result.inputs_used,
      formula: result.formula,
      interpretation: result.interpretation,
    });
  }

  // Try the extra metrics defined in this file.
  const extraFn = EXTRA_METRICS[metric];
  if (extraFn) {
    const result = extraFn(inputs);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error, metric: result.metric, missing_inputs: result.missing_inputs ?? null },
        { status: 422 },
      );
    }
    return NextResponse.json({
      metric: result.metric,
      result: result.value,
      inputs: result.inputs_used,
      formula: result.formula,
      interpretation: result.interpretation,
    });
  }

  // Unknown metric.
  const allMetrics = [...AVAILABLE_METRICS, ...Object.keys(EXTRA_METRICS), ...Object.keys(METRIC_ALIASES)];
  return NextResponse.json(
    { error: `Unknown metric "${rawMetric}". Available: ${allMetrics.join(", ")}` },
    { status: 400 },
  );
}
