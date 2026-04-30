"use client";

// HoldingsSection — single-glance view of every account, holding,
// insurance policy, and beneficiary we've parsed for this contact.
//
// Reads /api/contacts/[id]/holdings, which aggregates document_extractions
// rows of type retirement_statement / insurance_policy / beneficiary_form.
//
// Empty state guides the advisor to upload + parse documents — that's
// the entry point that gets data into this view.
//
// Design follows Harvey tokens: 1px rules, no shadows, mono numerics.

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  PiggyBank,
  Building2,
  Shield,
  Users,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";

interface Account {
  extraction_id: string;
  document_id: string;
  document_name: string | null;
  custodian: string | null;
  plan_name: string | null;
  account_type: string | null;
  period_end: string | null;
  ending_balance: number | null;
  employee_contributions_ytd: number | null;
  employer_match_ytd: number | null;
  deferral_rate: number | null;
  vested_balance: number | null;
  vesting_percent: number | null;
  roth_balance: number | null;
  pretax_balance: number | null;
  loan_balance: number | null;
  rmd_due: number | null;
  verified: boolean;
  confidence: number | null;
}

interface Holding {
  document_id: string;
  custodian: string | null;
  account_type: string | null;
  fund_name: string | null;
  ticker: string | null;
  shares: number | null;
  market_value: number | null;
  allocation_percent: number | null;
  asset_class: string | null;
}

interface InsurancePolicy {
  extraction_id: string;
  document_name: string | null;
  policy_type: string | null;
  carrier: string | null;
  policy_number: string | null;
  policy_owner: string | null;
  insured_name: string | null;
  face_amount: number | null;
  cash_value: number | null;
  premium_amount: number | null;
  premium_frequency: string | null;
  loan_balance: number | null;
  riders: string | null;
  verified: boolean;
  confidence: number | null;
}

interface Beneficiary {
  source_doc: string | null;
  account_label: string;
  custodian: string | null;
  account_type: string | null;
  tier: string;
  name: string;
  relationship: string | null;
  percent: number | null;
  is_trust: boolean;
  is_per_stirpes: boolean;
}

interface HoldingsResponse {
  accounts: Account[];
  holdings: Holding[];
  insurance: InsurancePolicy[];
  beneficiaries: Beneficiary[];
  summary: {
    total_assets: number;
    total_death_benefit?: number;
    account_count: number;
    holding_count: number;
    policy_count: number;
    beneficiary_count: number;
    document_count: number;
    extraction_count: number;
  };
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtPercent(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(1)}%`;
}

function humanizeAccountType(t: string | null): string {
  if (!t) return "—";
  const map: Record<string, string> = {
    traditional_401k: "Traditional 401(k)",
    roth_401k: "Roth 401(k)",
    "403b": "403(b)",
    "457b": "457(b)",
    traditional_ira: "Traditional IRA",
    roth_ira: "Roth IRA",
    sep_ira: "SEP IRA",
    simple_ira: "SIMPLE IRA",
    pension: "Pension",
    cash_balance: "Cash balance",
    term_life: "Term life",
    whole_life: "Whole life",
    universal_life: "Universal life",
    variable_universal_life: "Variable universal life",
    indexed_universal_life: "Indexed universal life",
    disability_income: "Disability income",
    long_term_care: "Long-term care",
    fixed_annuity: "Fixed annuity",
    variable_annuity: "Variable annuity",
    fixed_indexed_annuity: "Fixed indexed annuity",
    immediate_annuity: "Immediate annuity",
    other: "Other",
  };
  return map[t] || t.replace(/_/g, " ");
}

export default function HoldingsSection({
  contactId,
}: {
  contactId: string;
}) {
  const [data, setData] = useState<HoldingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/contacts/${contactId}/holdings`, {
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || "Failed to load");
        return;
      }
      setData(j as HoldingsResponse);
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <section className="card-flat p-6">
        <div className="label-section mb-3">Holdings</div>
        <div className="flex items-center gap-2 text-xs text-[var(--ink-subtle)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
          Loading parsed account data…
        </div>
      </section>
    );
  }

  if (err) {
    return (
      <section className="card-flat p-6">
        <div className="label-section mb-3">Holdings</div>
        <div className="flex items-center gap-2 text-xs text-[var(--danger)]">
          <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
          {err}
        </div>
      </section>
    );
  }

  if (!data) return null;

  const isEmpty =
    data.accounts.length === 0 &&
    data.insurance.length === 0 &&
    data.beneficiaries.length === 0;

  if (isEmpty) {
    return (
      <section className="card-flat p-6">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="label-section mb-1">Holdings</div>
            <h2 className="text-base font-semibold">
              No parsed account data yet
            </h2>
          </div>
        </div>
        <p className="text-xs text-[var(--ink-muted)] leading-relaxed max-w-prose">
          Upload statements, beneficiary forms, or insurance policies in the{" "}
          <span className="text-[var(--ink)]">Documents</span> section and run{" "}
          <span className="text-[var(--ink)]">Extract data</span>. This view
          aggregates everything we've parsed — account balances, holdings,
          policies, beneficiaries — into a single picture for D/V to ground
          its planning recommendations on.
        </p>
        {data.summary.document_count > 0 && (
          <p className="text-[11px] text-[var(--ink-subtle)] mt-3">
            {data.summary.document_count} document
            {data.summary.document_count === 1 ? "" : "s"} uploaded · 0
            extracted yet
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="card-flat p-6 space-y-6">
      {/* Summary strip */}
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <div className="label-section mb-1">Holdings</div>
          <h2 className="text-base font-semibold">
            Parsed from {data.summary.extraction_count} document
            {data.summary.extraction_count === 1 ? "" : "s"}
          </h2>
        </div>
        <div className="flex items-center gap-5 text-xs">
          {data.summary.total_assets > 0 && (
            <div>
              <span className="text-[var(--ink-muted)]">Total assets · </span>
              <span className="mono tabular-nums text-[var(--ink)] font-semibold">
                {fmtMoney(data.summary.total_assets)}
              </span>
            </div>
          )}
          {(data.summary.total_death_benefit || 0) > 0 && (
            <div>
              <span className="text-[var(--ink-muted)]">Death benefit · </span>
              <span className="mono tabular-nums text-[var(--ink)]">
                {fmtMoney(data.summary.total_death_benefit)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Accounts */}
      {data.accounts.length > 0 && (
        <div>
          <div className="label-section mb-3 flex items-center gap-2">
            <PiggyBank
              className="w-3.5 h-3.5 text-[var(--ink-muted)]"
              strokeWidth={1.5}
            />
            Accounts · {data.accounts.length}
          </div>
          <div className="border border-[var(--rule)] divide-y divide-[var(--rule)] rounded-[4px]">
            {data.accounts.map((a) => (
              <div key={a.extraction_id} className="px-3 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--ink)] flex items-center gap-2 flex-wrap">
                      <span>{a.custodian || "Unknown custodian"}</span>
                      <span className="text-[var(--ink-subtle)]">·</span>
                      <span className="text-[var(--ink-muted)] font-normal">
                        {humanizeAccountType(a.account_type)}
                      </span>
                      {a.verified && (
                        <span className="chip-verified inline-flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          verified
                        </span>
                      )}
                    </div>
                    {a.plan_name && (
                      <div className="text-[11px] text-[var(--ink-subtle)] mt-0.5">
                        {a.plan_name}
                      </div>
                    )}
                  </div>
                  <div className="mono tabular-nums text-sm font-semibold text-[var(--ink)]">
                    {fmtMoney(a.ending_balance)}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 mt-2.5 text-[11px] text-[var(--ink-muted)]">
                  {a.deferral_rate !== null && (
                    <div>
                      Deferral ·{" "}
                      <span className="mono tabular-nums text-[var(--ink)]">
                        {fmtPercent(a.deferral_rate)}
                      </span>
                    </div>
                  )}
                  {a.vesting_percent !== null && (
                    <div>
                      Vested ·{" "}
                      <span className="mono tabular-nums text-[var(--ink)]">
                        {fmtPercent(a.vesting_percent)}
                      </span>
                    </div>
                  )}
                  {a.employee_contributions_ytd !== null && (
                    <div>
                      Contrib YTD ·{" "}
                      <span className="mono tabular-nums text-[var(--ink)]">
                        {fmtMoney(a.employee_contributions_ytd)}
                      </span>
                    </div>
                  )}
                  {a.employer_match_ytd !== null && (
                    <div>
                      Match YTD ·{" "}
                      <span className="mono tabular-nums text-[var(--ink)]">
                        {fmtMoney(a.employer_match_ytd)}
                      </span>
                    </div>
                  )}
                  {a.roth_balance !== null && a.roth_balance > 0 && (
                    <div>
                      Roth ·{" "}
                      <span className="mono tabular-nums text-[var(--ink)]">
                        {fmtMoney(a.roth_balance)}
                      </span>
                    </div>
                  )}
                  {a.pretax_balance !== null && a.pretax_balance > 0 && (
                    <div>
                      Pre-tax ·{" "}
                      <span className="mono tabular-nums text-[var(--ink)]">
                        {fmtMoney(a.pretax_balance)}
                      </span>
                    </div>
                  )}
                  {a.loan_balance !== null && a.loan_balance > 0 && (
                    <div>
                      Loan ·{" "}
                      <span className="mono tabular-nums text-[var(--danger)]">
                        {fmtMoney(a.loan_balance)}
                      </span>
                    </div>
                  )}
                  {a.rmd_due !== null && a.rmd_due > 0 && (
                    <div>
                      RMD due ·{" "}
                      <span className="mono tabular-nums text-[var(--accent)] font-semibold">
                        {fmtMoney(a.rmd_due)}
                      </span>
                    </div>
                  )}
                </div>
                {a.period_end && (
                  <div className="text-[10px] text-[var(--ink-subtle)] mt-2 mono">
                    as of {a.period_end}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings */}
      {data.holdings.length > 0 && (
        <div>
          <div className="label-section mb-3 flex items-center gap-2">
            <Building2
              className="w-3.5 h-3.5 text-[var(--ink-muted)]"
              strokeWidth={1.5}
            />
            Top holdings · {data.holdings.length}
          </div>
          <div className="border border-[var(--rule)] rounded-[4px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-[var(--canvas-subtle)] border-b border-[var(--rule)]">
                  <tr>
                    <th className="text-left px-3 py-2 label-section text-[var(--ink-muted)]">
                      Fund
                    </th>
                    <th className="text-left px-3 py-2 label-section text-[var(--ink-muted)]">
                      Ticker
                    </th>
                    <th className="text-left px-3 py-2 label-section text-[var(--ink-muted)]">
                      Account
                    </th>
                    <th className="text-right px-3 py-2 label-section text-[var(--ink-muted)]">
                      Shares
                    </th>
                    <th className="text-right px-3 py-2 label-section text-[var(--ink-muted)]">
                      Value
                    </th>
                    <th className="text-right px-3 py-2 label-section text-[var(--ink-muted)]">
                      Allocation
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule)]">
                  {data.holdings.slice(0, 25).map((h, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-[var(--ink)]">
                        {h.fund_name || "—"}
                        {h.asset_class && (
                          <div className="text-[10px] text-[var(--ink-subtle)] mt-0.5">
                            {h.asset_class}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 mono text-[var(--ink-muted)]">
                        {h.ticker || "—"}
                      </td>
                      <td className="px-3 py-2 text-[var(--ink-muted)]">
                        {[h.custodian, humanizeAccountType(h.account_type)]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2 mono tabular-nums text-right text-[var(--ink)]">
                        {h.shares !== null
                          ? h.shares.toLocaleString("en-US", {
                              maximumFractionDigits: 3,
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-2 mono tabular-nums text-right text-[var(--ink)]">
                        {fmtMoney(h.market_value)}
                      </td>
                      <td className="px-3 py-2 mono tabular-nums text-right text-[var(--ink-muted)]">
                        {fmtPercent(h.allocation_percent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.holdings.length > 25 && (
              <div className="px-3 py-2 text-[10px] text-[var(--ink-subtle)] border-t border-[var(--rule)]">
                Showing top 25 of {data.holdings.length} holdings
              </div>
            )}
          </div>
        </div>
      )}

      {/* Insurance */}
      {data.insurance.length > 0 && (
        <div>
          <div className="label-section mb-3 flex items-center gap-2">
            <Shield
              className="w-3.5 h-3.5 text-[var(--ink-muted)]"
              strokeWidth={1.5}
            />
            Insurance · {data.insurance.length}
          </div>
          <div className="border border-[var(--rule)] divide-y divide-[var(--rule)] rounded-[4px]">
            {data.insurance.map((p) => (
              <div key={p.extraction_id} className="px-3 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--ink)] flex items-center gap-2 flex-wrap">
                      <span>{p.carrier || "Unknown carrier"}</span>
                      <span className="text-[var(--ink-subtle)]">·</span>
                      <span className="text-[var(--ink-muted)] font-normal">
                        {humanizeAccountType(p.policy_type)}
                      </span>
                      {p.verified && (
                        <span className="chip-verified inline-flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          verified
                        </span>
                      )}
                    </div>
                    {p.policy_number && (
                      <div className="text-[11px] text-[var(--ink-subtle)] mt-0.5 mono">
                        Policy #{p.policy_number}
                      </div>
                    )}
                  </div>
                  <div className="mono tabular-nums text-sm font-semibold text-[var(--ink)]">
                    {fmtMoney(p.face_amount)}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 mt-2.5 text-[11px] text-[var(--ink-muted)]">
                  {p.insured_name && (
                    <div>
                      Insured ·{" "}
                      <span className="text-[var(--ink)]">{p.insured_name}</span>
                    </div>
                  )}
                  {p.policy_owner && p.policy_owner !== p.insured_name && (
                    <div>
                      Owner ·{" "}
                      <span className="text-[var(--ink)]">{p.policy_owner}</span>
                    </div>
                  )}
                  {p.cash_value !== null && p.cash_value > 0 && (
                    <div>
                      Cash value ·{" "}
                      <span className="mono tabular-nums text-[var(--ink)]">
                        {fmtMoney(p.cash_value)}
                      </span>
                    </div>
                  )}
                  {p.premium_amount !== null && (
                    <div>
                      Premium ·{" "}
                      <span className="mono tabular-nums text-[var(--ink)]">
                        {fmtMoney(p.premium_amount)}
                      </span>
                      {p.premium_frequency && (
                        <span className="text-[var(--ink-subtle)]">
                          {" "}/ {p.premium_frequency}
                        </span>
                      )}
                    </div>
                  )}
                  {p.loan_balance !== null && p.loan_balance > 0 && (
                    <div>
                      Loan ·{" "}
                      <span className="mono tabular-nums text-[var(--danger)]">
                        {fmtMoney(p.loan_balance)}
                      </span>
                    </div>
                  )}
                </div>
                {p.riders && (
                  <div className="text-[11px] text-[var(--ink-subtle)] mt-2">
                    Riders: {p.riders}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Beneficiaries */}
      {data.beneficiaries.length > 0 && (
        <div>
          <div className="label-section mb-3 flex items-center gap-2">
            <Users
              className="w-3.5 h-3.5 text-[var(--ink-muted)]"
              strokeWidth={1.5}
            />
            Beneficiary designations · {data.beneficiaries.length}
          </div>
          <div className="border border-[var(--rule)] rounded-[4px] overflow-hidden">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--canvas-subtle)] border-b border-[var(--rule)]">
                <tr>
                  <th className="text-left px-3 py-2 label-section text-[var(--ink-muted)]">
                    Account
                  </th>
                  <th className="text-left px-3 py-2 label-section text-[var(--ink-muted)]">
                    Tier
                  </th>
                  <th className="text-left px-3 py-2 label-section text-[var(--ink-muted)]">
                    Beneficiary
                  </th>
                  <th className="text-left px-3 py-2 label-section text-[var(--ink-muted)]">
                    Relationship
                  </th>
                  <th className="text-right px-3 py-2 label-section text-[var(--ink-muted)]">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule)]">
                {data.beneficiaries.map((b, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-[var(--ink-muted)]">
                      {b.account_label}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[10px] mono uppercase tracking-wider"
                        style={{
                          color:
                            b.tier === "primary"
                              ? "var(--ink)"
                              : "var(--ink-muted)",
                        }}
                      >
                        {b.tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--ink)]">
                      {b.name}
                      {b.is_trust && (
                        <span className="ml-1.5 text-[10px] text-[var(--ink-subtle)] mono">
                          (trust)
                        </span>
                      )}
                      {b.is_per_stirpes && (
                        <span className="ml-1.5 text-[10px] text-[var(--ink-subtle)] mono">
                          per stirpes
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--ink-muted)]">
                      {b.relationship || "—"}
                    </td>
                    <td className="px-3 py-2 mono tabular-nums text-right text-[var(--ink)]">
                      {fmtPercent(b.percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
