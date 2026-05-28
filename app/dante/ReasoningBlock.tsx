"use client";

// app/dante/ReasoningBlock.tsx
//
// Renders a structured `reasoning` code block — Drift's
// "graphic organizer" surface for math and step-by-step logic.
//
// The agent emits these whenever it's explaining a calculation,
// walking through a decision, or comparing scenarios. Instead of
// hiding the work in prose, the user gets a visual breakdown they
// can scan at a glance.
//
// Supported kinds:
//   calculation  — numbered steps leading to a result
//   decision     — branching logic with a conclusion
//   comparison   — side-by-side columns
//   allocation   — proportional bars summing to 100%
//   timeline     — chronological milestones
//   chart        — bar / line / pie via recharts
//
// Why custom JSON instead of Mermaid:
//   The audience (55-70+ CRE brokers) doesn't read flowcharts.
//   Step-cards and charts are more familiar and more readable.
//   No new dependency (mermaid would be +600KB).
//   Tighter design control — matches the citation chip / vault
//   popover styling.

import { useMemo } from "react";
import {
  Calculator,
  GitBranch,
  ArrowLeftRight,
  Sparkles,
  PieChart as PieChartIcon,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export type ReasoningKind =
  | "calculation"
  | "decision"
  | "comparison"
  | "allocation"
  | "timeline"
  // Chart — renders a recharts bar, line, or pie chart. Vergil uses
  // this for rent comps, demographic breakdowns, vacancy rates, cap
  // rate trends, and any numeric dataset that reads better visual.
  | "chart";

export interface ReasoningStep {
  label: string;
  value: string;
  source?: string;
  highlight?: boolean;
  column?: string;
  weight?: number;
  date?: string;
  /** For "chart" kind — numeric value for the data point. If omitted,
   *  the renderer tries to parse a number out of `value`. */
  numericValue?: number;
  /** For "chart" kind — optional color hex for this data point. */
  color?: string;
}

export interface ReasoningBlockData {
  kind: ReasoningKind;
  title: string;
  subtitle?: string;
  steps: ReasoningStep[];
  conclusion?: string;
  /** For "chart" kind — "bar" | "line" | "pie". Defaults to "bar". */
  chartType?: "bar" | "line" | "pie";
  /** For "chart" kind — Y-axis label (e.g. "$/SF", "Units", "%"). */
  yAxisLabel?: string;
  /** For "chart" kind — X-axis label. */
  xAxisLabel?: string;
}

/**
 * Parse a raw JSON string from a ```reasoning code block. Returns
 * null on any structural problem so the renderer can fall back to
 * showing the JSON as a plain code block.
 */
export function parseReasoningBlock(raw: string): ReasoningBlockData | null {
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(raw);
  } catch {
    // Lenient parse: strip trailing commas, comments, single quotes
    try {
      const cleaned = raw
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\b(NaN|undefined)\b/g, "null");
      obj = JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  if (
    obj.kind !== "calculation" &&
    obj.kind !== "decision" &&
    obj.kind !== "comparison" &&
    obj.kind !== "allocation" &&
    obj.kind !== "timeline" &&
    obj.kind !== "chart"
  ) {
    return null;
  }
  if (typeof obj.title !== "string") return null;
  if (!Array.isArray(obj.steps)) return null;
  return obj as ReasoningBlockData;
}

export default function ReasoningBlock({ data }: { data: ReasoningBlockData }) {
  if (data.kind === "comparison") {
    return <ComparisonView data={data} />;
  }
  if (data.kind === "allocation") {
    return <AllocationView data={data} />;
  }
  if (data.kind === "timeline") {
    return <TimelineView data={data} />;
  }
  if (data.kind === "chart") {
    return <ChartView data={data} />;
  }

  const Icon = data.kind === "calculation" ? Calculator : GitBranch;

  return (
    <section
      aria-label={data.title}
      className="my-3 border border-[var(--rule)] rounded-md overflow-hidden bg-[var(--surface,#fff)]"
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
        <Icon
          className="w-3.5 h-3.5 text-[var(--ink-muted)]"
          strokeWidth={1.5}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            {data.kind === "calculation"
              ? "Calculation"
              : data.kind === "decision"
                ? "Decision"
                : "Comparison"}
          </div>
          <div className="text-sm font-medium text-[var(--ink)] truncate">
            {data.title}
          </div>
        </div>
      </header>

      {data.subtitle && (
        <div className="px-4 pt-3 text-xs text-[var(--ink-muted)] italic">
          {data.subtitle}
        </div>
      )}

      <ol className="divide-y divide-[var(--rule)]/60">
        {data.steps.map((step, i) => (
          <li
            key={i}
            className={`px-4 py-2.5 ${
              step.highlight
                ? "bg-[var(--accent-soft,rgba(37,99,235,0.05))]"
                : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-[13px] text-[var(--ink-muted)] flex-1 min-w-0">
                <span className="mono text-[10px] text-[var(--ink-subtle)] mr-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {step.label}
              </div>
              <div
                className={`text-sm tabular-nums shrink-0 ${
                  step.highlight
                    ? "font-semibold text-[var(--accent,#2563eb)]"
                    : "text-[var(--ink)]"
                }`}
              >
                {step.value}
              </div>
            </div>
            {step.source && (
              <div className="mt-1 ml-7 text-[11px] text-[var(--ink-subtle)] flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" strokeWidth={1.5} />
                {step.source}
              </div>
            )}
          </li>
        ))}
      </ol>

      {data.conclusion && (
        <div className="px-4 py-3 border-t border-[var(--rule)] bg-[var(--accent-soft,rgba(37,99,235,0.05))] text-sm text-[var(--ink)]">
          <span className="mono text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mr-2">
            Result
          </span>
          {data.conclusion}
        </div>
      )}
    </section>
  );
}

/**
 * Comparison renders as a side-by-side table-like layout grouped
 * by the `column` field on each step. If no steps carry a column,
 * we fall back to the calculation/decision card.
 */
function ComparisonView({ data }: { data: ReasoningBlockData }) {
  const columns = Array.from(
    new Set(data.steps.map((s) => s.column).filter((c): c is string => Boolean(c))),
  );
  if (columns.length === 0) {
    // Re-render as a calculation card.
    return <ReasoningBlock data={{ ...data, kind: "calculation" }} />;
  }
  // Group rows by label so identical labels across columns line up.
  const labels = Array.from(new Set(data.steps.map((s) => s.label)));
  const matrix: Record<string, Record<string, ReasoningStep | undefined>> = {};
  for (const l of labels) matrix[l] = {};
  for (const s of data.steps) {
    if (s.column) matrix[s.label][s.column] = s;
  }

  return (
    <section
      aria-label={data.title}
      className="my-3 border border-[var(--rule)] rounded-md overflow-hidden bg-[var(--surface,#fff)]"
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
        <ArrowLeftRight
          className="w-3.5 h-3.5 text-[var(--ink-muted)]"
          strokeWidth={1.5}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Comparison
          </div>
          <div className="text-sm font-medium text-[var(--ink)] truncate">
            {data.title}
          </div>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[var(--canvas-subtle,rgba(0,0,0,0.02))]">
            <tr>
              <th className="text-left text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)] px-4 py-2 border-b border-[var(--rule)]"></th>
              {columns.map((c) => (
                <th
                  key={c}
                  className="text-left text-[13px] font-medium text-[var(--ink)] px-4 py-2 border-b border-[var(--rule)]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, ri) => (
              <tr
                key={ri}
                className="border-b border-[var(--rule)]/60 last:border-0"
              >
                <td className="text-[13px] text-[var(--ink-muted)] px-4 py-2 align-top">
                  {label}
                </td>
                {columns.map((c) => {
                  const step = matrix[label][c];
                  return (
                    <td
                      key={c}
                      className={`text-sm tabular-nums px-4 py-2 align-top ${
                        step?.highlight
                          ? "font-semibold text-[var(--accent,#2563eb)]"
                          : "text-[var(--ink)]"
                      }`}
                    >
                      {step?.value || "—"}
                      {step?.source && (
                        <div className="text-[11px] text-[var(--ink-subtle)] mt-0.5">
                          {step.source}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.conclusion && (
        <div className="px-4 py-3 border-t border-[var(--rule)] bg-[var(--accent-soft,rgba(37,99,235,0.05))] text-sm text-[var(--ink)]">
          <span className="mono text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mr-2">
            Result
          </span>
          {data.conclusion}
        </div>
      )}
    </section>
  );
}

/**
 * Allocation renders proportional bars summing to 100%. Each step
 * is one slice; weights normalize so the agent doesn't have to do
 * the math. If a step omits `weight`, the renderer tries to parse a
 * percentage out of the `value` field ("23%" → 23). Steps that yield
 * no usable weight render as a 0%-bar — visible but inert.
 */
function AllocationView({ data }: { data: ReasoningBlockData }) {
  const parsed = data.steps.map((s) => {
    if (typeof s.weight === "number" && s.weight >= 0) return s.weight;
    const m = s.value.match(/(-?\d+(?:\.\d+)?)\s*%/);
    return m ? Math.max(0, parseFloat(m[1])) : 0;
  });
  const total = parsed.reduce((a, b) => a + b, 0) || 1;

  return (
    <section
      aria-label={data.title}
      className="my-3 border border-[var(--rule)] rounded-md overflow-hidden bg-[var(--surface,#fff)]"
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
        <PieChartIcon
          className="w-3.5 h-3.5 text-[var(--ink-muted)]"
          strokeWidth={1.5}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Allocation
          </div>
          <div className="text-sm font-medium text-[var(--ink)] truncate">
            {data.title}
          </div>
        </div>
      </header>

      {data.subtitle && (
        <div className="px-4 pt-3 text-xs text-[var(--ink-muted)] italic">
          {data.subtitle}
        </div>
      )}

      <ul className="px-4 py-3 space-y-2.5">
        {data.steps.map((step, i) => {
          const pct = (parsed[i] / total) * 100;
          return (
            <li key={i} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className={`truncate ${step.highlight ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>
                  {step.label}
                </span>
                <span className={`tabular-nums shrink-0 ${step.highlight ? "font-semibold text-[var(--accent,#2563eb)]" : "text-[var(--ink)]"}`}>
                  {step.value}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--canvas-subtle,rgba(0,0,0,0.06))] overflow-hidden">
                <div
                  className={`h-full ${step.highlight ? "bg-[var(--accent,#2563eb)]" : "bg-[var(--ink-muted)]"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              {step.source && (
                <div className="text-[11px] text-[var(--ink-subtle)] flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" strokeWidth={1.5} />
                  {step.source}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {data.conclusion && (
        <div className="px-4 py-3 border-t border-[var(--rule)] bg-[var(--accent-soft,rgba(37,99,235,0.05))] text-sm text-[var(--ink)]">
          <span className="mono text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mr-2">
            Result
          </span>
          {data.conclusion}
        </div>
      )}
    </section>
  );
}

/**
 * Timeline renders chronological milestones along a vertical rail.
 * Each step is a dated event; `date` is shown as the kicker, label
 * as the milestone, value as the outcome / amount / status.
 * Highlight marks the milestone the user should focus on (next
 * deadline, current action). If no step has `date`, the layout
 * still works — graceful rather than broken.
 */
function TimelineView({ data }: { data: ReasoningBlockData }) {
  return (
    <section
      aria-label={data.title}
      className="my-3 border border-[var(--rule)] rounded-md overflow-hidden bg-[var(--surface,#fff)]"
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
        <CalendarDays
          className="w-3.5 h-3.5 text-[var(--ink-muted)]"
          strokeWidth={1.5}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Timeline
          </div>
          <div className="text-sm font-medium text-[var(--ink)] truncate">
            {data.title}
          </div>
        </div>
      </header>

      {data.subtitle && (
        <div className="px-4 pt-3 text-xs text-[var(--ink-muted)] italic">
          {data.subtitle}
        </div>
      )}

      <ol className="px-4 py-3 relative">
        <div className="absolute left-[1.25rem] top-4 bottom-4 w-px bg-[var(--rule)]" aria-hidden />
        {data.steps.map((step, i) => (
          <li key={i} className="relative pl-8 pb-4 last:pb-0">
            <span
              className={`absolute left-3 top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                step.highlight
                  ? "border-[var(--accent,#2563eb)] bg-[var(--accent,#2563eb)]"
                  : "border-[var(--ink-muted)] bg-[var(--surface,#fff)]"
              }`}
              aria-hidden
            />
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                {step.date && (
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                    {step.date}
                  </div>
                )}
                <div className={`text-[13px] ${step.highlight ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>
                  {step.label}
                </div>
              </div>
              <div className={`text-sm tabular-nums shrink-0 ${step.highlight ? "font-semibold text-[var(--accent,#2563eb)]" : "text-[var(--ink)]"}`}>
                {step.value}
              </div>
            </div>
            {step.source && (
              <div className="mt-1 text-[11px] text-[var(--ink-subtle)] flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" strokeWidth={1.5} />
                {step.source}
              </div>
            )}
          </li>
        ))}
      </ol>

      {data.conclusion && (
        <div className="px-4 py-3 border-t border-[var(--rule)] bg-[var(--accent-soft,rgba(37,99,235,0.05))] text-sm text-[var(--ink)]">
          <span className="mono text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mr-2">
            Result
          </span>
          {data.conclusion}
        </div>
      )}
    </section>
  );
}

// ── Chart view ──────────────────────────────────────────────────

const CHART_PALETTE = [
  "#374151", "#6B7280", "#9CA3AF", "#1F2937",
  "#D1D5DB", "#4B5563", "#E5E7EB", "#111827",
];

function ChartView({ data }: { data: ReasoningBlockData }) {
  const chartType = data.chartType || "bar";

  const chartData = useMemo(() =>
    data.steps.map((step) => {
      let num = step.numericValue;
      if (num == null) {
        const cleaned = step.value.replace(/[$,%]/g, "").replace(/,/g, "");
        num = parseFloat(cleaned) || 0;
      }
      return { name: step.label, value: num, displayValue: step.value, color: step.color };
    }),
  [data.steps]);

  const tip = {
    background: "var(--surface, #fff)",
    border: "1px solid var(--rule, #e5e7eb)",
    borderRadius: 6, fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  };

  return (
    <section aria-label={data.title} className="my-5 border border-[var(--rule)] rounded-lg overflow-hidden bg-[var(--surface,#fff)]">
      <header className="flex items-center gap-2 px-5 py-4 border-b border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
        <BarChart3 className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            {chartType === "pie" ? "Distribution" : "Chart"}
          </div>
          <div className="text-sm font-medium text-[var(--ink)] truncate">{data.title}</div>
        </div>
      </header>
      {data.subtitle && <div className="px-5 pt-3 text-xs text-[var(--ink-muted)] italic">{data.subtitle}</div>}
      <div className="px-4 py-5" style={{ height: chartType === "pie" ? 320 : 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule, #e5e7eb)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-muted, #6b7280)" }} axisLine={{ stroke: "var(--rule, #e5e7eb)" }} tickLine={false} interval={0} angle={chartData.length > 6 ? -35 : 0} textAnchor={chartData.length > 6 ? "end" : "middle"} height={chartData.length > 6 ? 60 : 30} label={data.xAxisLabel ? { value: data.xAxisLabel, position: "insideBottom", offset: -20, fontSize: 11, fill: "var(--ink-subtle, #9ca3af)" } : undefined} />
              <YAxis tick={{ fontSize: 11, fill: "var(--ink-muted, #6b7280)" }} axisLine={false} tickLine={false} width={50} label={data.yAxisLabel ? { value: data.yAxisLabel, angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "var(--ink-subtle, #9ca3af)" } : undefined} />
              <Tooltip contentStyle={tip} formatter={(_v: number, _n: string, p: any) => [p.payload.displayValue, ""]} labelStyle={{ fontWeight: 500 }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={48}>
                {chartData.map((e, i) => <Cell key={i} fill={e.color || CHART_PALETTE[i % CHART_PALETTE.length]} />)}
              </Bar>
            </BarChart>
          ) : chartType === "line" ? (
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule, #e5e7eb)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-muted, #6b7280)" }} axisLine={{ stroke: "var(--rule, #e5e7eb)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--ink-muted, #6b7280)" }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={tip} formatter={(_v: number, _n: string, p: any) => [p.payload.displayValue, ""]} />
              <Line type="monotone" dataKey="value" stroke="#374151" strokeWidth={2} dot={{ fill: "#374151", r: 3 }} activeDot={{ r: 5, strokeWidth: 0 }} />
            </LineChart>
          ) : (
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} dataKey="value" nameKey="name" paddingAngle={2} stroke="none" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={{ stroke: "var(--ink-subtle, #9ca3af)", strokeWidth: 1 }}>
                {chartData.map((e, i) => <Cell key={i} fill={e.color || CHART_PALETTE[i % CHART_PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tip} formatter={(_v: number, _n: string, p: any) => [p.payload.displayValue, ""]} />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--ink-muted, #6b7280)" }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
      {data.conclusion && (
        <div className="px-5 py-3 border-t border-[var(--rule)] bg-[var(--accent-soft,rgba(37,99,235,0.05))] text-sm text-[var(--ink)]">
          <span className="mono text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mr-2">Takeaway</span>
          {data.conclusion}
        </div>
      )}
    </section>
  );
}
