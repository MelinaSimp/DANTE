"use client";

// app/dante/PortfolioBlock.tsx
//
// Renders a portfolio summary dashboard inline in Dante chat.
// The agent emits a ```portfolio fenced block containing JSON with
// aggregate metrics and per-property breakdown. This component turns
// that into a scannable visual with KPI cards, a mini bar chart, and
// a property table.
//
// Schema (what the agent emits):
// {
//   "title": "Q2 2026 Portfolio Overview",
//   "metrics": {
//     "total_value": 12500000,
//     "total_noi": 875000,
//     "avg_cap_rate": 7.0,
//     "avg_occupancy": 92.5,
//     "total_sf": 45000,
//     "property_count": 4
//   },
//   "properties": [
//     {
//       "name": "Maple Ridge Plaza",
//       "type": "Retail",
//       "sf": 12000,
//       "noi": 240000,
//       "cap_rate": 7.2,
//       "occupancy": 95,
//       "value": 3333333,
//       "status": "stable" | "watch" | "opportunity"
//     }
//   ]
// }

import { useState } from "react";

export interface PortfolioProperty {
  name: string;
  type?: string;
  sf?: number;
  noi?: number;
  cap_rate?: number;
  occupancy?: number;
  value?: number;
  status?: "stable" | "watch" | "opportunity";
}

export interface PortfolioMetrics {
  total_value?: number;
  total_noi?: number;
  avg_cap_rate?: number;
  avg_occupancy?: number;
  total_sf?: number;
  property_count?: number;
}

export interface PortfolioData {
  title?: string;
  metrics?: PortfolioMetrics;
  properties?: PortfolioProperty[];
}

export function parsePortfolioBlock(raw: string): PortfolioData | null {
  try {
    const data = JSON.parse(raw);
    // Need at least metrics or properties
    if (!data.metrics && !data.properties) return null;
    if (data.properties && !Array.isArray(data.properties)) return null;
    return data as PortfolioData;
  } catch {
    return null;
  }
}

function formatCurrency(n: number | undefined): string {
  if (n === undefined || n === null) return "--";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatNumber(n: number | undefined, suffix = ""): string {
  if (n === undefined || n === null) return "--";
  return `${n.toLocaleString()}${suffix}`;
}

function formatPct(n: number | undefined): string {
  if (n === undefined || n === null) return "--";
  return `${n.toFixed(1)}%`;
}

function KPICard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-[var(--canvas-subtle)]">
      <span className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm font-semibold text-[var(--ink)]">{value}</span>
    </div>
  );
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  stable: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "Stable",
  },
  watch: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    label: "Watch",
  },
  opportunity: {
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    label: "Opportunity",
  },
};

function NOIBar({ properties }: { properties: PortfolioProperty[] }) {
  const withNOI = properties.filter((p) => p.noi && p.noi > 0);
  if (withNOI.length === 0) return null;

  const totalNOI = withNOI.reduce((sum, p) => sum + (p.noi || 0), 0);
  if (totalNOI === 0) return null;

  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-purple-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-teal-500",
  ];

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">
        NOI Contribution
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700">
        {withNOI.map((p, i) => {
          const pct = ((p.noi || 0) / totalNOI) * 100;
          return (
            <div
              key={i}
              className={`${colors[i % colors.length]} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${p.name}: ${formatCurrency(p.noi)}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {withNOI.map((p, i) => (
          <span key={i} className="flex items-center gap-1 text-[10px] text-[var(--ink-muted)]">
            <span className={`w-2 h-2 rounded-sm ${colors[i % colors.length]}`} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PortfolioBlock({ data }: { data: PortfolioData }) {
  const [expanded, setExpanded] = useState(true);
  const m = data.metrics;
  const props = data.properties || [];

  return (
    <div className="space-y-3 rounded-xl border border-[var(--rule)] bg-[var(--canvas)] p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-[var(--ink)] tracking-wide uppercase">
            {data.title || "Portfolio Summary"}
          </div>
          {m?.property_count && (
            <div className="text-[10px] text-[var(--ink-muted)]">
              {m.property_count} properties
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {m.total_value !== undefined && (
            <KPICard label="Total Value" value={formatCurrency(m.total_value)} />
          )}
          {m.total_noi !== undefined && (
            <KPICard label="Total NOI" value={formatCurrency(m.total_noi)} />
          )}
          {m.avg_cap_rate !== undefined && (
            <KPICard label="Avg Cap Rate" value={formatPct(m.avg_cap_rate)} />
          )}
          {m.avg_occupancy !== undefined && (
            <KPICard label="Avg Occupancy" value={formatPct(m.avg_occupancy)} />
          )}
          {m.total_sf !== undefined && (
            <KPICard label="Total SF" value={formatNumber(m.total_sf, " SF")} />
          )}
        </div>
      )}

      {/* NOI Bar */}
      {props.length > 1 && <NOIBar properties={props} />}

      {/* Property Table */}
      {props.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-[10px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition mb-2"
          >
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Property breakdown
          </button>
          {expanded && (
            <div className="overflow-x-auto rounded-lg border border-[var(--rule)]">
              <table className="w-full text-[11px]">
                <thead className="bg-[var(--canvas-subtle)]">
                  <tr>
                    <th className="text-left font-medium text-[var(--ink-muted)] px-3 py-1.5">
                      Property
                    </th>
                    <th className="text-left font-medium text-[var(--ink-muted)] px-3 py-1.5">
                      Type
                    </th>
                    <th className="text-right font-medium text-[var(--ink-muted)] px-3 py-1.5">
                      NOI
                    </th>
                    <th className="text-right font-medium text-[var(--ink-muted)] px-3 py-1.5">
                      Cap
                    </th>
                    <th className="text-right font-medium text-[var(--ink-muted)] px-3 py-1.5">
                      Occ
                    </th>
                    <th className="text-center font-medium text-[var(--ink-muted)] px-3 py-1.5">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {props.map((p, i) => {
                    const st = STATUS_STYLE[p.status || "stable"] || STATUS_STYLE.stable;
                    return (
                      <tr
                        key={i}
                        className="border-t border-[var(--rule)]/50 hover:bg-[var(--canvas-subtle)]/50 transition"
                      >
                        <td className="px-3 py-1.5 text-[var(--ink)] font-medium">
                          {p.name}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--ink-muted)]">
                          {p.type || "--"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[var(--ink)]">
                          {formatCurrency(p.noi)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[var(--ink)]">
                          {formatPct(p.cap_rate)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[var(--ink)]">
                          {formatPct(p.occupancy)}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${st.bg} ${st.text}`}
                          >
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-[10px] text-[var(--ink-muted)] pt-1">
        Metrics based on data available to Dante. Verify all figures
        against source documents before making investment decisions.
      </div>
    </div>
  );
}
