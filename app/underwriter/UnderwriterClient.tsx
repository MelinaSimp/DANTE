"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { usePageContext } from "@/components/dante/PageContext";
import {
  type DCFInput,
  DEFAULT_ASSUMPTIONS,
  computeDcfSummary,
} from "@/lib/underwriting/dcf-math";
import type { ParsedRentRoll } from "@/lib/underwriting/rent-roll-parser";

// ── form state (strings while editing; rates held as percents) ────

interface FormState {
  name: string;
  address: string;
  sf: string;
  units: string;
  year_built: string;
  analysis_period_years: string;
  discount_rate: string;
  terminal_cap_rate: string;
  rent_growth_rate: string;
  expense_growth_rate: string;
  vacancy_rate: string;
  selling_costs: string;
  gross_potential_rent: string;
  other_income: string;
  reimbursements: string;
  operating_expenses: string;
  management_fee: string;
  insurance: string;
  taxes: string;
  reserves: string;
  purchase_price: string;
  closing_costs: string;
  capex_budget: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  address: "",
  sf: "",
  units: "",
  year_built: "",
  analysis_period_years: String(DEFAULT_ASSUMPTIONS.analysis_period_years),
  discount_rate: pct(DEFAULT_ASSUMPTIONS.discount_rate),
  terminal_cap_rate: pct(DEFAULT_ASSUMPTIONS.terminal_cap_rate),
  rent_growth_rate: pct(DEFAULT_ASSUMPTIONS.rent_growth_rate),
  expense_growth_rate: pct(DEFAULT_ASSUMPTIONS.expense_growth_rate),
  vacancy_rate: pct(DEFAULT_ASSUMPTIONS.vacancy_rate),
  selling_costs: pct(DEFAULT_ASSUMPTIONS.selling_costs),
  gross_potential_rent: "",
  other_income: "0",
  reimbursements: "0",
  operating_expenses: "",
  management_fee: "0",
  insurance: "0",
  taxes: "0",
  reserves: "0",
  purchase_price: "",
  closing_costs: "0",
  capex_budget: "0",
};

function pct(decimal: number): string {
  return String(Math.round(decimal * 1e6) / 1e4);
}
function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function blankToZero(s: string): boolean {
  return String(s).trim() === "";
}

function formFromSuggested(s: DCFInput): FormState {
  return {
    name: s.property.name ?? "",
    address: s.property.address ?? "",
    sf: s.property.sf ? String(s.property.sf) : "",
    units: s.property.units != null ? String(s.property.units) : "",
    year_built: s.property.year_built != null ? String(s.property.year_built) : "",
    analysis_period_years: String(s.assumptions.analysis_period_years),
    discount_rate: pct(s.assumptions.discount_rate),
    terminal_cap_rate: pct(s.assumptions.terminal_cap_rate),
    rent_growth_rate: pct(s.assumptions.rent_growth_rate),
    expense_growth_rate: pct(s.assumptions.expense_growth_rate),
    vacancy_rate: pct(s.assumptions.vacancy_rate),
    selling_costs: pct(s.assumptions.selling_costs),
    gross_potential_rent: s.income.gross_potential_rent ? String(s.income.gross_potential_rent) : "",
    other_income: String(s.income.other_income ?? 0),
    reimbursements: String(s.income.reimbursements ?? 0),
    operating_expenses: s.expenses.operating_expenses ? String(s.expenses.operating_expenses) : "",
    management_fee: String(s.expenses.management_fee ?? 0),
    insurance: String(s.expenses.insurance ?? 0),
    taxes: String(s.expenses.taxes ?? 0),
    reserves: String(s.expenses.reserves ?? 0),
    purchase_price: s.acquisition?.purchase_price != null ? String(s.acquisition.purchase_price) : "",
    closing_costs: String(s.acquisition?.closing_costs ?? 0),
    capex_budget: String(s.acquisition?.capex_budget ?? 0),
  };
}

function buildInput(f: FormState): DCFInput {
  const period = Math.min(30, Math.max(1, Math.round(parseNum(f.analysis_period_years)) || 10));
  return {
    property: {
      name: f.name.trim() || "Untitled Asset",
      address: f.address.trim(),
      sf: parseNum(f.sf),
      units: blankToZero(f.units) ? undefined : parseNum(f.units),
      year_built: blankToZero(f.year_built) ? undefined : parseNum(f.year_built),
    },
    assumptions: {
      analysis_period_years: period,
      discount_rate: parseNum(f.discount_rate) / 100,
      terminal_cap_rate: parseNum(f.terminal_cap_rate) / 100,
      rent_growth_rate: parseNum(f.rent_growth_rate) / 100,
      expense_growth_rate: parseNum(f.expense_growth_rate) / 100,
      vacancy_rate: parseNum(f.vacancy_rate) / 100,
      selling_costs: parseNum(f.selling_costs) / 100,
    },
    income: {
      gross_potential_rent: parseNum(f.gross_potential_rent),
      other_income: parseNum(f.other_income),
      reimbursements: parseNum(f.reimbursements),
    },
    expenses: {
      operating_expenses: parseNum(f.operating_expenses),
      management_fee: parseNum(f.management_fee),
      insurance: parseNum(f.insurance),
      taxes: parseNum(f.taxes),
      reserves: parseNum(f.reserves),
    },
    acquisition: {
      purchase_price: blankToZero(f.purchase_price) ? undefined : parseNum(f.purchase_price),
      closing_costs: parseNum(f.closing_costs),
      capex_budget: parseNum(f.capex_budget),
    },
  };
}

// ── formatters ───────────────────────────────────────────────────

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const usd2 = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctStr = (n: number) => `${(n * 100).toFixed(2)}%`;
const num0 = (n: number) => n.toLocaleString("en-US");

const inputClass =
  "w-full rounded-[var(--r-input)] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

export default function UnderwriterClient() {
  usePageContext({
    title: "Underwriter",
    subtitle: "Rent roll to a full DCF model in one click",
  });

  const [step, setStep] = useState<"upload" | "model">("upload");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedRentRoll | null>(null);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showTenants, setShowTenants] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof FormState) => (v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  const input = useMemo(() => buildInput(form), [form]);
  const summary = useMemo(() => computeDcfSummary(input), [input]);
  const canGenerate = input.property.sf > 0 && input.income.gross_potential_rent > 0;

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/underwrite/parse", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not parse the rent roll.");
      }
      setParsed(data.parsed as ParsedRentRoll);
      setSources((data.sources as Record<string, string>) || {});
      setForm(formFromSuggested(data.suggested as DCFInput));
      setFileName(data.fileName as string);
      setStep("model");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const downloadModel = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/underwrite/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ input, sources }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Model generation failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `underwriting-${(input.property.name || "model")
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const reset = () => {
    setStep("upload");
    setParsed(null);
    setSources({});
    setForm(EMPTY_FORM);
    setFileName("");
    setError(null);
    setShowTenants(false);
  };

  return (
    <div className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* Hero */}
        <div className="mb-8">
          <div className="label-section mb-1.5">Commercial real estate</div>
          <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
            One-Click Underwriter
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
            Drop a rent roll and get a full multi-tab DCF model — NOI, cap rate, unlevered
            IRR, 10-year cash flows, and reversion — with every figure traced to its source.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[var(--r-input)] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto p-0.5 hover:opacity-70">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {step === "upload" ? (
          <UploadPane
            dragOver={dragOver}
            uploading={uploading}
            fileInputRef={fileInputRef}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onPick={(file) => handleFile(file)}
          />
        ) : (
          <div className="space-y-6">
            {/* Source bar */}
            {parsed && (
              <div className="card-flat px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-[var(--r-input)] bg-[var(--canvas-subtle)] border border-[var(--rule)] p-2 shrink-0">
                    <FileSpreadsheet className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)] truncate">{fileName}</p>
                    <p className="mono text-[11px] text-[var(--ink-subtle)]">
                      {parsed.totals.tenantCount} tenants
                      {parsed.totals.vacantCount > 0 && ` · ${parsed.totals.vacantCount} vacant`}
                      {parsed.totals.totalSf > 0 && ` · ${num0(parsed.totals.totalSf)} SF`}
                      {parsed.totals.totalSf > 0 &&
                        ` · ${(parsed.totals.occupancyPct * 100).toFixed(1)}% occupied`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                  Replace rent roll
                </button>
              </div>
            )}

            {/* Warnings */}
            {parsed && parsed.warnings.length > 0 && (
              <div className="rounded-[var(--r-card)] border border-[var(--flag)]/30 bg-[var(--flag-soft)] px-4 py-3">
                <p className="label-section mb-1.5 text-[var(--flag)]">Review before relying on these figures</p>
                <ul className="space-y-1">
                  {parsed.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-[var(--ink)] flex items-start gap-2">
                      <span className="text-[var(--flag)] shrink-0 mt-0.5">-</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
              {/* Left: assumptions form */}
              <div className="space-y-6 min-w-0">
                <Section title="Property">
                  <div className="grid grid-cols-2 gap-4">
                    <TextField label="Property name" value={form.name} onChange={set("name")} className="col-span-2" />
                    <TextField label="Address" value={form.address} onChange={set("address")} className="col-span-2" placeholder="Optional" />
                    <NumField label="Rentable SF" value={form.sf} onChange={set("sf")} required />
                    <NumField label="Units" value={form.units} onChange={set("units")} placeholder="Optional" />
                    <NumField label="Year built" value={form.year_built} onChange={set("year_built")} placeholder="Optional" />
                  </div>
                </Section>

                <Section title="Income (Year 1)">
                  <div className="grid grid-cols-2 gap-4">
                    <NumField label="Gross potential rent" value={form.gross_potential_rent} onChange={set("gross_potential_rent")} prefix="$" required />
                    <NumField label="Other income" value={form.other_income} onChange={set("other_income")} prefix="$" />
                    <NumField label="Reimbursements" value={form.reimbursements} onChange={set("reimbursements")} prefix="$" />
                  </div>
                </Section>

                <Section title="Operating expenses (Year 1)">
                  <div className="grid grid-cols-2 gap-4">
                    <NumField label="Operating expenses" value={form.operating_expenses} onChange={set("operating_expenses")} prefix="$" required />
                    <NumField label="Management fee" value={form.management_fee} onChange={set("management_fee")} prefix="$" />
                    <NumField label="Insurance" value={form.insurance} onChange={set("insurance")} prefix="$" />
                    <NumField label="Real estate taxes" value={form.taxes} onChange={set("taxes")} prefix="$" />
                    <NumField label="Reserves" value={form.reserves} onChange={set("reserves")} prefix="$" />
                  </div>
                </Section>

                <Section title="Assumptions">
                  <div className="grid grid-cols-2 gap-4">
                    <NumField label="Analysis period (yrs)" value={form.analysis_period_years} onChange={set("analysis_period_years")} />
                    <NumField label="Discount rate" value={form.discount_rate} onChange={set("discount_rate")} suffix="%" />
                    <NumField label="Terminal cap rate" value={form.terminal_cap_rate} onChange={set("terminal_cap_rate")} suffix="%" />
                    <NumField label="Vacancy & collection" value={form.vacancy_rate} onChange={set("vacancy_rate")} suffix="%" />
                    <NumField label="Rent growth" value={form.rent_growth_rate} onChange={set("rent_growth_rate")} suffix="%" />
                    <NumField label="Expense growth" value={form.expense_growth_rate} onChange={set("expense_growth_rate")} suffix="%" />
                    <NumField label="Selling costs" value={form.selling_costs} onChange={set("selling_costs")} suffix="%" />
                  </div>
                </Section>

                <Section title="Acquisition" subtitle="Optional — adds the Returns Analysis tab (IRR, cash-on-cash, equity multiple)">
                  <div className="grid grid-cols-2 gap-4">
                    <NumField label="Purchase price" value={form.purchase_price} onChange={set("purchase_price")} prefix="$" placeholder="Optional" />
                    <NumField label="Closing costs" value={form.closing_costs} onChange={set("closing_costs")} prefix="$" />
                    <NumField label="CapEx budget" value={form.capex_budget} onChange={set("capex_budget")} prefix="$" />
                  </div>
                </Section>
              </div>

              {/* Right: live results (sticky) */}
              <div className="lg:sticky lg:top-4 space-y-4">
                <div className="card-flat p-5">
                  <div className="label-section mb-1">Indicated value (DCF)</div>
                  <div className="heading-display text-3xl text-[var(--ink)] leading-tight">
                    {canGenerate ? usd0(summary.indicatedValue) : "--"}
                  </div>
                  {canGenerate && summary.valuePerSF > 0 && (
                    <div className="mono text-[11px] text-[var(--ink-subtle)] mt-1">
                      {usd2(summary.valuePerSF)} / SF · implied {pctStr(summary.impliedGoingInCapRate)} cap
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Metric label="Year 1 NOI" value={canGenerate ? usd0(summary.year1NOI) : "--"} />
                    <Metric label="Terminal cap" value={pctStr(input.assumptions.terminal_cap_rate)} />
                    {summary.returns ? (
                      <>
                        <Metric label="Unlevered IRR" value={summary.returns.irr != null ? pctStr(summary.returns.irr) : "n/a"} accent />
                        <Metric label="Equity multiple" value={`${summary.returns.equityMultiple}x`} accent />
                        <Metric label="Going-in cap" value={pctStr(summary.returns.goingInCapRate)} />
                        <Metric label="Cash-on-cash" value={pctStr(summary.returns.cashOnCash)} />
                      </>
                    ) : (
                      <Metric
                        label="Returns"
                        value="Add purchase price"
                        muted
                      />
                    )}
                  </div>

                  <button
                    onClick={downloadModel}
                    disabled={!canGenerate || generating}
                    className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--r-input)] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Download className="w-4 h-4" strokeWidth={1.5} />
                    )}
                    {generating ? "Building model..." : "Download Excel model"}
                  </button>
                  {!canGenerate && (
                    <p className="text-[11px] text-[var(--ink-subtle)] mt-2 text-center">
                      Enter rentable SF and gross potential rent to build the model.
                    </p>
                  )}
                </div>

                <div className="rounded-[var(--r-card)] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--verified)] shrink-0 mt-0.5" strokeWidth={1.5} />
                  <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
                    Every figure in the exported model is listed on a <span className="text-[var(--ink)]">Model Sources</span> tab —
                    rent-roll values trace to their column and rows; assumptions are marked as analyst inputs.
                  </p>
                </div>
              </div>
            </div>

            {/* Rent roll table */}
            {parsed && parsed.tenants.length > 0 && (
              <div>
                <button
                  onClick={() => setShowTenants((v) => !v)}
                  className="flex items-center gap-1.5 mb-2.5 label-section hover:text-[var(--ink)] transition"
                >
                  {showTenants ? (
                    <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                  )}
                  Parsed rent roll ({parsed.tenants.length} rows)
                </button>
                {showTenants && (
                  <div className="rounded-[var(--r-card)] border border-[var(--rule)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                          <th className="text-left py-2 px-3 label-section w-[64px]">Row</th>
                          <th className="text-left py-2 px-3 label-section">Tenant</th>
                          <th className="text-left py-2 px-3 label-section w-[90px]">Suite</th>
                          <th className="text-right py-2 px-3 label-section w-[100px]">SF</th>
                          <th className="text-right py-2 px-3 label-section w-[130px]">Annual rent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--rule)]">
                        {parsed.tenants.map((t, i) => (
                          <tr key={i} className="hover:bg-[var(--canvas-subtle)]/50 transition">
                            <td className="py-2 px-3">
                              <span className="mono text-[11px] text-[var(--ink-subtle)]">#{t.sourceRow}</span>
                            </td>
                            <td className="py-2 px-3 text-[var(--ink)]">
                              {t.isVacant ? (
                                <span className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)]">Vacant</span>
                              ) : (
                                t.tenant || "--"
                              )}
                            </td>
                            <td className="py-2 px-3 text-[var(--ink-muted)]">{t.suite || "--"}</td>
                            <td className="py-2 px-3 text-right text-[var(--ink-muted)] mono text-xs">
                              {t.sf != null ? num0(t.sf) : "--"}
                            </td>
                            <td className="py-2 px-3 text-right text-[var(--ink)] mono text-xs">
                              {t.annualRent != null ? usd0(t.annualRent) : "--"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Disclaimer */}
            <div className="px-3 py-2 rounded-[var(--r-card)] bg-[var(--canvas-subtle)] border border-[var(--rule)] text-[11px] text-[var(--ink-muted)] leading-relaxed">
              AI-assisted underwriting model. All figures must be independently verified against source
              documents before use in any transaction, financing, or investment-committee decision.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────

function UploadPane(props: {
  dragOver: boolean;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onPick: (file: File) => void;
}) {
  return (
    <div className="card-flat p-8">
      <div
        onDrop={props.onDrop}
        onDragOver={props.onDragOver}
        onDragLeave={props.onDragLeave}
        onClick={() => props.fileInputRef.current?.click()}
        className={`rounded-[var(--r-card)] border-2 border-dashed p-12 text-center cursor-pointer transition ${
          props.dragOver
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--rule)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)]"
        }`}
      >
        <input
          ref={props.fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) props.onPick(file);
            e.target.value = "";
          }}
        />
        {props.uploading ? (
          <div className="flex items-center justify-center gap-2 text-[var(--ink-muted)]">
            <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
            <span className="text-sm">Parsing rent roll...</span>
          </div>
        ) : (
          <>
            <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-3 mx-auto w-fit mb-4">
              <Upload className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />
            </div>
            <p className="text-base font-medium text-[var(--ink)]">Drop a rent roll here</p>
            <p className="text-sm text-[var(--ink-subtle)] mt-1">Excel or CSV — we detect the tenant, SF, and rent columns automatically</p>
          </>
        )}
      </div>

      <div className="mt-6 flex items-start gap-2.5">
        <TrendingUp className="w-4 h-4 text-[var(--ink-subtle)] shrink-0 mt-0.5" strokeWidth={1.5} />
        <p className="text-xs text-[var(--ink-muted)] leading-relaxed max-w-2xl">
          We total the occupied base rent and rentable area, seed a 10-year DCF, and let you tune every
          assumption before exporting. The model includes Assumptions, a year-by-year Cash Flow Projection,
          Returns Analysis, and a Model Sources tab for full traceability.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-flat p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-[var(--ink)]">{title}</h2>
        {subtitle && <p className="text-[11px] text-[var(--ink-subtle)] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function fieldWrap(label: string, required: boolean, className: string, node: React.ReactNode, hint?: string) {
  return (
    <label className={`block ${className}`}>
      <span className="label-section block mb-1">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </span>
      {node}
      {hint && <span className="text-[11px] text-[var(--ink-subtle)] mt-1 block">{hint}</span>}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  className = "",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return fieldWrap(
    label,
    false,
    className,
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />,
  );
}

function NumField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return fieldWrap(
    label,
    required,
    "",
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-subtle)] pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} ${prefix ? "pl-7" : ""} ${suffix ? "pr-8" : ""}`}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-subtle)] pointer-events-none">
          {suffix}
        </span>
      )}
    </div>,
    hint,
  );
}

function Metric({
  label,
  value,
  accent = false,
  muted = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-[var(--r-input)] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider font-medium text-[var(--ink-subtle)]">{label}</div>
      <div
        className={`text-sm font-semibold mt-0.5 truncate ${
          muted ? "text-[var(--ink-subtle)] font-normal" : accent ? "text-[var(--accent)]" : "text-[var(--ink)]"
        }`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
