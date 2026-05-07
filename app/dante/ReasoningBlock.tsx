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
// Format the agent emits:
//
//     ```reasoning
//     {
//       "kind": "calculation" | "decision" | "comparison",
//       "title": "RMD calculation for Sarah Smith, 2026",
//       "steps": [
//         {
//           "label": "Account balance (Dec 31 2025)",
//           "value": "$850,000"
//         },
//         {
//           "label": "Holder age in 2026",
//           "value": "73"
//         },
//         {
//           "label": "Uniform Lifetime divisor",
//           "value": "26.5",
//           "source": "Treas. Reg. §1.401(a)(9)-9 Table III"
//         },
//         {
//           "label": "RMD = balance ÷ divisor",
//           "value": "$32,075.47",
//           "highlight": true
//         }
//       ]
//     }
//     ```
//
// Why custom JSON instead of Mermaid:
//   • The audience (older RIA principals) doesn't read flowcharts.
//     Step-cards are more familiar and more readable.
//   • No new dependency (mermaid would be +600KB).
//   • Tighter design control — matches the citation chip / vault
//     popover styling.
//   • Each step can carry a `source` field that integrates with the
//     existing citation infrastructure.
//
// The renderer is intentionally minimal — three shapes (calc /
// decision / comparison), one styled card per shape. If we need
// richer diagrams later, mermaid is an additive option that drops
// in alongside this without replacing it.

import {
  Calculator,
  GitBranch,
  ArrowLeftRight,
  Sparkles,
  PieChart,
  CalendarDays,
} from "lucide-react";

export type ReasoningKind =
  | "calculation"
  | "decision"
  | "comparison"
  // Allocation — proportional bars summing toward a whole. Dante:
  // portfolio asset-class %, expense breakdown, sector tilt. Vergil:
  // budget allocation, comp-price distribution, deal-stage funnel.
  | "allocation"
  // Timeline — chronological milestones. Dante: client lifecycle,
  // RMD windows, contribution deadlines. Vergil: transaction
  // timeline, contingency cadence, listing schedule.
  | "timeline";

export interface ReasoningStep {
  /** What this step represents — short label, no period. */
  label: string;
  /** The value or outcome. Free text — currency, divisor, "yes", etc. */
  value: string;
  /** Optional citation. Free text; no enforced format. */
  source?: string;
  /** Optional — when true, the step is rendered as the conclusion
   *  (heavier weight, accent color). The final step of a calculation
   *  is the typical use. */
  highlight?: boolean;
  /** Optional — for "comparison" kind, which column the step
   *  belongs to. Free text label like "Roth conversion" or
   *  "Stay in traditional". */
  column?: string;
  /** Optional — for "allocation" kind, the proportional weight of
   *  this slice. Numeric; renderer normalizes to 100%. If omitted,
   *  the renderer tries to parse a % out of `value`. */
  weight?: number;
  /** Optional — for "timeline" kind, ISO date string or human-
   *  readable date label ("Q3 2026", "Mar 15, 2026"). */
  date?: string;
}

export interface ReasoningBlockData {
  kind: ReasoningKind;
  title: string;
  /** Optional one-line subtitle — when the calculation has a key
   *  caveat the user should see immediately ("Assumes single
   *  beneficiary; spousal Joint table not applied"). */
  subtitle?: string;
  steps: ReasoningStep[];
  /** Optional — for "decision" kind, the final answer. */
  conclusion?: string;
}

/**
 * Parse a raw JSON string from a ```reasoning code block. Returns
 * null on any structural problem so the renderer can fall back to
 * showing the JSON as a plain code block.
 */
export function parseReasoningBlock(raw: string): ReasoningBlockData | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    if (
      obj.kind !== "calculation" &&
      obj.kind !== "decision" &&
      obj.kind !== "comparison" &&
      obj.kind !== "allocation" &&
      obj.kind !== "timeline"
    ) {
      return null;
    }
    if (typeof obj.title !== "string") return null;
    if (!Array.isArray(obj.steps)) return null;
    return obj as ReasoningBlockData;
  } catch {
    return null;
  }
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
        <PieChart
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
