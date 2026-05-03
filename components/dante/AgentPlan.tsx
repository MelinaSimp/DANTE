"use client";

// AgentPlan — the "show your work" disclosure that sits beneath
// every D/V assistant turn. Renders the trace the agent loop emits
// (StepLogEntry[]) as a collapsible step-by-step plan: each tool
// call, its status, a short summary of what came back.
//
// Always collapsed by default — single line "Finished in N steps ▾"
// matches Harvey's pattern. Expand to see the full plan when the
// user wants to verify the methodology.
//
// Data source: the existing trace persisted alongside every assistant
// message (dante_chat_messages.trace) and streamed live via
// streamClient. No new API needed; we render what's already in the
// state.

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Circle,
  Wrench,
} from "lucide-react";
import type { StepLogEntry } from "@/lib/dante/workflow-types";

interface Props {
  trace: unknown;
}

// Recover the duration in ms from a step's timestamps. Negative or
// NaN values just collapse to "—" in render.
function durationMs(step: StepLogEntry): number {
  const start = new Date(step.started_at).getTime();
  const end = new Date(step.finished_at).getTime();
  return end - start;
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Pull a one-line "what this step did" summary from the step's
// output. Each tool returns a different shape; we cherry-pick the
// useful field for the few we recognise and fall back to "—".
function summarizeStep(step: StepLogEntry): string {
  if (step.error) return step.error;
  const out = step.output as Record<string, unknown> | undefined;
  if (!out) return "";

  // memory.search → output.result.hits.length
  if (step.step_name.includes("memory") && step.step_name.includes("search")) {
    const hits = ((out as any).result?.hits ?? []) as unknown[];
    return `${hits.length} hit${hits.length === 1 ? "" : "s"}`;
  }
  if (step.step_name.includes("vault") && step.step_name.includes("cite")) {
    const cites = ((out as any).result?.citations ?? []) as unknown[];
    return `${cites.length} citation${cites.length === 1 ? "" : "s"}`;
  }
  if (step.step_name.includes("clients") && step.step_name.includes("query")) {
    const rows = ((out as any).result?.rows ?? []) as unknown[];
    return `${rows.length} contact${rows.length === 1 ? "" : "s"}`;
  }
  if (step.step_name.includes("archive") && step.step_name.includes("search")) {
    const docs = ((out as any).result?.documents ?? []) as unknown[];
    return `${docs.length} document${docs.length === 1 ? "" : "s"}`;
  }
  if (step.step_name.includes("skill")) {
    const txt = ((out as any).result?.text ?? "") as string;
    if (typeof txt === "string" && txt.length > 0) {
      return txt.length > 80 ? txt.slice(0, 77) + "…" : txt;
    }
  }
  // Generic — surface whatever short string we can find.
  const result = (out as any).result;
  if (typeof result === "string") {
    return result.length > 80 ? result.slice(0, 77) + "…" : result;
  }
  return "";
}

// The agent loop emits one StepLogEntry per tool call. We collapse
// the "iteration_thinking" / scaffolding steps (step_type that's not
// a real tool) into the count but don't render them as their own
// rows — they read as noise to a non-engineer.
//
// "thinking" preamble steps live in <ReasoningDisclosure /> so they
// don't show up as engineer-style rows here.
function isVisibleStep(step: StepLogEntry): boolean {
  if (/→\s*thinking$/.test(step.step_name)) return false;
  // Heuristic: render anything that has a recognisable tool prefix.
  // The agent step ids look like "memory_search_3" / "vault_cite_1";
  // skip the wrapper "agent_loop" / "iteration_thinking" scaffolding.
  const name = step.step_name.toLowerCase();
  return (
    name.includes("memory") ||
    name.includes("vault") ||
    name.includes("archive") ||
    name.includes("clients") ||
    name.includes("skill") ||
    name.includes("email") ||
    name.includes("http")
  );
}

export default function AgentPlan({ trace }: Props) {
  const [open, setOpen] = useState(false);
  const steps = useMemo<StepLogEntry[]>(() => {
    if (!Array.isArray(trace)) return [];
    return (trace as StepLogEntry[]).filter(isVisibleStep);
  }, [trace]);

  if (steps.length === 0) return null;

  const successes = steps.filter((s) => s.status === "success").length;
  const errors = steps.filter((s) => s.status === "error").length;

  return (
    <div className="mt-3 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
        )}
        <span className="mono uppercase tracking-wider text-[10px]">
          Finished in {steps.length} step{steps.length === 1 ? "" : "s"}
          {errors > 0 ? ` · ${errors} error${errors === 1 ? "" : "s"}` : ""}
        </span>
      </button>

      {open && (
        <ol className="mt-2 ml-1 border-l border-[var(--rule)]">
          {steps.map((step, idx) => {
            const ms = durationMs(step);
            const summary = summarizeStep(step);
            const Icon =
              step.status === "success"
                ? CheckCircle2
                : step.status === "error"
                ? XCircle
                : Circle;
            const iconColor =
              step.status === "success"
                ? "var(--verified)"
                : step.status === "error"
                ? "var(--danger)"
                : "var(--ink-subtle)";
            return (
              <li
                key={`${step.step_id}-${idx}`}
                className="relative pl-4 py-1.5 -ml-px border-l-0"
              >
                <span className="absolute -left-[7px] top-2 inline-flex items-center justify-center bg-[var(--canvas)]">
                  <Icon
                    className="w-3 h-3"
                    strokeWidth={1.75}
                    style={{ color: iconColor }}
                  />
                </span>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <Wrench
                    className="w-2.5 h-2.5 text-[var(--ink-subtle)]"
                    strokeWidth={1.5}
                  />
                  <span className="mono text-[11px] text-[var(--ink)]">
                    {step.step_name}
                  </span>
                  {summary && (
                    <span className="text-[11px] text-[var(--ink-muted)] truncate">
                      → {summary}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] mono text-[var(--ink-subtle)]">
                    {fmtDuration(ms)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
