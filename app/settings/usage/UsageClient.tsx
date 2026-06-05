"use client";

// UsageClient — workspace-internal cost dashboard.
//
// Top: monthly bill, COGS, gross margin, prior-month delta.
// Then: spend by source (which feature), spend by model, daily
// timeseries. All workspace-scoped via /api/me/usage.

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Sparkles,
  Mic,
  Mail,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Activity,
} from "lucide-react";
import AllowanceCard from "./AllowanceCard";

interface UsageData {
  workspace: { id: string; name: string };
  period: { start: string; end: string };
  summary: {
    total_cost_cents: number;
    total_cost_usd: number;
    monthly_price_usd: number;
    gross_margin_usd: number;
    gross_margin_pct: number | null;
    prior_month_cost_cents: number;
    event_count: number;
  };
  by_kind: Record<string, { quantity: number; cost_cents: number }>;
  by_source: Record<
    string,
    { cost_cents: number; events: number; quantity: number }
  >;
  by_model: Record<
    string,
    { input_tokens: number; output_tokens: number; cost_cents: number }
  >;
  by_workflow?: Array<{
    workflow_id: string;
    name: string;
    cost_cents: number;
    calls: number;
  }>;
  daily: Record<string, number>;
}

const KIND_META: Record<
  string,
  { label: string; unit: string; icon: any }
> = {
  llm_tokens_input: { label: "LLM input tokens", unit: "tokens", icon: Sparkles },
  llm_tokens_output: { label: "LLM output tokens", unit: "tokens", icon: Sparkles },
  voice_minutes: { label: "Voice minutes", unit: "min", icon: Mic },
  email_sent: { label: "Emails sent", unit: "msgs", icon: Mail },
  sms_sent: { label: "SMS sent", unit: "msgs", icon: MessageSquare },
};

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtUsd(usd: number): string {
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function humanizeSource(s: string): string {
  if (s === "(unattributed)") return "(unattributed)";
  // Common patterns we use in source: "dante.chat", "planning.roth",
  // "calls.summary", "compliance.scan", etc. Title-case them.
  return s
    .split(".")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).replace(/_/g, " "))
    .join(" · ");
}

export default function UsageClient() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/me/usage", { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || "Failed to load");
        return;
      }
      setData(j as UsageData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-[var(--ink-subtle)]">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          Loading usage…
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center px-6">
        <div className="card-flat p-6 text-center">
          <AlertCircle
            className="w-6 h-6 text-[var(--danger)] mx-auto mb-2"
            strokeWidth={1.5}
          />
          <p className="text-sm text-[var(--ink)]">{err || "No data"}</p>
        </div>
      </div>
    );
  }

  const monthName = new Date(data.period.start).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const priorCents = data.summary.prior_month_cost_cents;
  const thisCents = data.summary.total_cost_cents;
  const deltaPct =
    priorCents > 0
      ? Math.round(((thisCents - priorCents) / priorCents) * 100)
      : null;

  const sources = Object.entries(data.by_source).sort(
    (a, b) => b[1].cost_cents - a[1].cost_cents,
  );
  const models = Object.entries(data.by_model).sort(
    (a, b) => b[1].cost_cents - a[1].cost_cents,
  );
  const dailyEntries = Object.entries(data.daily);
  const maxDaily = Math.max(1, ...dailyEntries.map(([, v]) => v));

  // Sparkline geometry
  const sparkW = 600;
  const sparkH = 60;
  const stepX = sparkW / Math.max(1, dailyEntries.length - 1);
  const sparkPath = dailyEntries
    .map(([, v], i) => {
      const x = i * stepX;
      const y = sparkH - (v / maxDaily) * (sparkH - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const margin = data.summary.gross_margin_pct;
  const marginColor =
    margin === null
      ? "var(--ink-subtle)"
      : margin >= 70
      ? "var(--verified)"
      : margin >= 40
      ? "var(--ink)"
      : margin >= 0
      ? "var(--flag, var(--accent))"
      : "var(--danger)";

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 space-y-8">
        {/* Plan allowance card — pulls from the new ledger-backed
            usage status. Shows the customer their MTD vs included
            allowance + overage projection. */}
        <AllowanceCard />
        {/* Header */}
        <div>
          <div className="label-section mb-1">Usage &amp; cost</div>
          <h1 className="heading-display text-3xl text-[var(--ink)]">
            {data.workspace.name} · {monthName}
          </h1>
          <p className="prose-body text-[var(--ink-muted)] mt-1.5 max-w-prose">
            Real cost-of-goods on this workspace this month — the LLM
            calls, voice minutes, emails, and SMS we paid for to deliver
            your subscription. Numbers update within a minute of each
            event.
          </p>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border border-[var(--rule)] rounded-[6px] p-4 bg-[var(--canvas)]">
            <div className="flex items-center gap-1.5 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2">
              <DollarSign className="w-3 h-3" strokeWidth={1.5} />
              Plan price
            </div>
            <div className="text-2xl font-semibold mono tabular-nums">
              {fmtUsd(data.summary.monthly_price_usd)}
            </div>
            <div className="text-[10px] text-[var(--ink-subtle)] mono mt-1">
              billed monthly
            </div>
          </div>
          <div className="border border-[var(--rule)] rounded-[6px] p-4 bg-[var(--canvas)]">
            <div className="flex items-center gap-1.5 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2">
              <Activity className="w-3 h-3" strokeWidth={1.5} />
              Cost this month
            </div>
            <div className="text-2xl font-semibold mono tabular-nums">
              {fmtUsd(data.summary.total_cost_usd)}
            </div>
            <div className="text-[10px] text-[var(--ink-subtle)] mt-1 flex items-center gap-1 mono">
              {deltaPct !== null ? (
                <>
                  {deltaPct < 0 ? (
                    <TrendingDown className="w-2.5 h-2.5 text-[var(--verified)]" strokeWidth={1.5} />
                  ) : (
                    <TrendingUp
                      className="w-2.5 h-2.5"
                      style={{
                        color:
                          deltaPct > 30
                            ? "var(--danger)"
                            : "var(--ink-muted)",
                      }}
                      strokeWidth={1.5}
                    />
                  )}
                  {Math.abs(deltaPct)}% vs prior mo
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="border border-[var(--rule)] rounded-[6px] p-4 bg-[var(--canvas)]">
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2">
              Gross margin
            </div>
            <div
              className="text-2xl font-semibold mono tabular-nums"
              style={{ color: marginColor }}
            >
              {margin !== null ? `${margin}%` : "—"}
            </div>
            <div className="text-[10px] text-[var(--ink-subtle)] mt-1 mono">
              {fmtUsd(data.summary.gross_margin_usd)} contribution
            </div>
          </div>
          <div className="border border-[var(--rule)] rounded-[6px] p-4 bg-[var(--canvas)]">
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2">
              Events
            </div>
            <div className="text-2xl font-semibold mono tabular-nums">
              {fmtNumber(data.summary.event_count)}
            </div>
            <div className="text-[10px] text-[var(--ink-subtle)] mt-1 mono">
              recorded this month
            </div>
          </div>
        </div>

        {/* Daily sparkline */}
        <section className="card-flat p-6">
          <div className="label-section mb-3">Daily spend (last 30 days)</div>
          <svg
            viewBox={`0 0 ${sparkW} ${sparkH}`}
            className="w-full h-16"
            preserveAspectRatio="none"
          >
            <path
              d={sparkPath}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.5}
            />
          </svg>
          <div className="flex justify-between text-[10px] text-[var(--ink-subtle)] mono mt-1">
            <span>{dailyEntries[0]?.[0]}</span>
            <span>peak {fmtCents(maxDaily)}</span>
            <span>{dailyEntries[dailyEntries.length - 1]?.[0]}</span>
          </div>
        </section>

        {/* Spend by source (feature) */}
        {sources.length > 0 && (
          <section className="card-flat p-6">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="label-section mb-1">Spend by feature</div>
                <h2 className="text-base font-semibold">
                  Where the cost is going
                </h2>
              </div>
              <div className="text-xs text-[var(--ink-muted)]">
                {sources.length} source
                {sources.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="border border-[var(--rule)] rounded-[4px] divide-y divide-[var(--rule)]">
              {sources.slice(0, 20).map(([source, s]) => {
                const pct = (s.cost_cents / Math.max(1, thisCents)) * 100;
                return (
                  <div
                    key={source}
                    className="px-3 py-2.5 flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[var(--ink)] truncate">
                        {humanizeSource(source)}
                      </div>
                      <div className="h-1 rounded-full bg-[var(--canvas-subtle)] mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-[var(--ink)]"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="mono tabular-nums text-sm text-[var(--ink)]">
                        {fmtCents(s.cost_cents)}
                      </div>
                      <div className="text-[10px] text-[var(--ink-subtle)] mono">
                        {pct.toFixed(1)}% · {s.events} ev
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* By kind (LLM tokens, voice minutes, etc) */}
        <section className="card-flat p-6">
          <div className="label-section mb-3">Spend by category</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(KIND_META).map(([kind, meta]) => {
              const row = data.by_kind[kind];
              const Icon = meta.icon;
              if (!row) return null;
              return (
                <div
                  key={kind}
                  className="border border-[var(--rule)] rounded-[4px] p-3"
                >
                  <div className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)] mb-1.5">
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                    {meta.label}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-lg font-semibold mono tabular-nums text-[var(--ink)]">
                      {fmtCents(row.cost_cents)}
                    </div>
                    <div className="text-[11px] text-[var(--ink-subtle)] mono">
                      {fmtNumber(row.quantity)} {meta.unit}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* By model */}
        {models.length > 0 && (
          <section className="card-flat p-6">
            <div className="label-section mb-3">LLM by model</div>
            <div className="border border-[var(--rule)] rounded-[4px] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[var(--canvas-subtle)] border-b border-[var(--rule)]">
                  <tr>
                    <th className="text-left px-3 py-2 label-section text-[var(--ink-muted)]">
                      Model
                    </th>
                    <th className="text-right px-3 py-2 label-section text-[var(--ink-muted)]">
                      Input tokens
                    </th>
                    <th className="text-right px-3 py-2 label-section text-[var(--ink-muted)]">
                      Output tokens
                    </th>
                    <th className="text-right px-3 py-2 label-section text-[var(--ink-muted)]">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule)]">
                  {models.map(([m, v]) => (
                    <tr key={m}>
                      <td className="px-3 py-2 mono text-[var(--ink)]">{m}</td>
                      <td className="px-3 py-2 mono tabular-nums text-right text-[var(--ink-muted)]">
                        {fmtNumber(v.input_tokens)}
                      </td>
                      <td className="px-3 py-2 mono tabular-nums text-right text-[var(--ink-muted)]">
                        {fmtNumber(v.output_tokens)}
                      </td>
                      <td className="px-3 py-2 mono tabular-nums text-right text-[var(--ink)]">
                        {fmtCents(v.cost_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* By workflow */}
        {data.by_workflow && data.by_workflow.length > 0 && (
          <section className="card-flat p-6">
            <div className="label-section mb-3">Cost by workflow</div>
            <div className="border border-[var(--rule)] rounded-[4px] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[var(--canvas-subtle)] border-b border-[var(--rule)]">
                  <tr>
                    <th className="text-left px-3 py-2 label-section text-[var(--ink-muted)]">
                      Workflow
                    </th>
                    <th className="text-right px-3 py-2 label-section text-[var(--ink-muted)]">
                      LLM calls
                    </th>
                    <th className="text-right px-3 py-2 label-section text-[var(--ink-muted)]">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule)]">
                  {data.by_workflow.map((wf) => (
                    <tr key={wf.workflow_id}>
                      <td className="px-3 py-2 text-[var(--ink)] truncate max-w-[240px]">{wf.name}</td>
                      <td className="px-3 py-2 mono tabular-nums text-right text-[var(--ink-muted)]">
                        {fmtNumber(wf.calls)}
                      </td>
                      <td className="px-3 py-2 mono tabular-nums text-right text-[var(--ink)]">
                        {fmtCents(wf.cost_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Footer note */}
        <p className="text-[11px] text-[var(--ink-subtle)] leading-relaxed max-w-prose">
          Costs are computed at the time of each event using the model&apos;s
          published pricing (lib/usage/pricing.ts). Voice minutes are
          billed at $0.15/min, SMS at $0.0079/segment, email at
          $0.001/recipient. These are our wholesale costs -- your plan
          price already includes a margin on top.
        </p>
      </div>
    </div>
  );
}
