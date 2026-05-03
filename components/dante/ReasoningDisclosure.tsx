"use client";

// ReasoningDisclosure — collapsible prose summary of the agent's
// narrative reasoning, rendered ABOVE the final answer.
//
// Source of truth: StepLogEntry items with step_name ending "→ thinking"
// and output.summary. Each iteration of the agent loop emits one of
// these as it commits to a tool batch. Concatenating them in order
// gives the advisor a "what did Dante decide to do, and why" view that
// reads like prose instead of an engineer's debug log.
//
// The per-tool engineer log lives in <AgentPlan />. Both render
// collapsed by default — the answer is what the user wants first;
// the machinery is one click away.

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { StepLogEntry } from "@/lib/dante/workflow-types";

interface Props {
  trace: unknown;
}

interface ThinkingEntry {
  iteration: number;
  summary: string;
}

function isThinkingStep(step: StepLogEntry): boolean {
  return /→\s*thinking$/.test(step.step_name);
}

export default function ReasoningDisclosure({ trace }: Props) {
  const [open, setOpen] = useState(false);

  const entries = useMemo<ThinkingEntry[]>(() => {
    if (!Array.isArray(trace)) return [];
    return (trace as StepLogEntry[])
      .filter(isThinkingStep)
      .map((s) => {
        const out = (s.output ?? {}) as Record<string, unknown>;
        const summary = typeof out.summary === "string" ? out.summary : "";
        const iteration = typeof out.iteration === "number" ? out.iteration : 0;
        return { iteration, summary };
      })
      .filter((e) => e.summary.length > 0)
      .sort((a, b) => a.iteration - b.iteration);
  }, [trace]);

  if (entries.length === 0) return null;

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
        <Sparkles className="w-3 h-3" strokeWidth={1.5} />
        <span className="mono uppercase tracking-wider text-[10px]">
          Reasoning · {entries.length} step{entries.length === 1 ? "" : "s"}
        </span>
      </button>

      {open && (
        <div className="mt-2 ml-1 pl-3 border-l border-[var(--rule)] space-y-1.5">
          {entries.map((e, i) => (
            <p
              key={i}
              className="text-[12px] leading-relaxed text-[var(--ink-muted)] italic"
            >
              {e.summary}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
