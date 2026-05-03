"use client";

// app/dante/MessageView.tsx
//
// Shared visual primitives for the Dante chat surface. Both /dante
// (ephemeral landing chat) and /dante/chat/[id] (persistent thread)
// render the same UserMessage / AssistantMessage / LiveThinking
// components so the two surfaces stay visually identical.
//
// No card/bubble wrappers. Plain prose, subtle action bar underneath,
// aggregated Sources block, suggested follow-ups. Harvey-style.

import { useState } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Wand2,
  Telescope,
  BookOpen,
  Users,
  FileText,
  Copy,
  Download,
  ThumbsUp,
  ThumbsDown,
  Check,
  ArrowRight,
} from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import { looksLikeDraft, deriveFilenameStem } from "./DocumentPanel";
import type { StreamState, CitationReportState } from "./streamClient";
import { buildCitationMap } from "@/lib/dante/citations";
import AgentPlan from "@/components/dante/AgentPlan";

const REWRITE_PRESETS = [
  { label: "Shorter", instruction: "Make it shorter — half the length, same key facts." },
  { label: "Bullets", instruction: "Rewrite as a bulleted list." },
  { label: "More formal", instruction: "Rewrite in a more formal, client-facing tone." },
  { label: "Add example", instruction: "Add a concrete example illustrating the main point." },
] as const;

// ── User message ────────────────────────────────────────────────

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-1.5 mt-0.5">
        <Users className="w-3 h-3 text-[var(--ink-muted)]" strokeWidth={1.5} />
      </div>
      <div className="flex-1 text-[var(--ink)] whitespace-pre-wrap text-sm leading-relaxed">
        {content}
      </div>
    </div>
  );
}

// ── Assistant message ───────────────────────────────────────────

export function AssistantMessage({
  content,
  trace,
  followups,
  citationReport,
  grounding,
  onOpenEditor,
  onRewrite,
  onFollowup,
  rewriting,
}: {
  content: string;
  trace: unknown;
  followups: string[];
  citationReport?: CitationReportState | null;
  /** Phase 4 W4.9 — grounding score from the SSE `grounding` frame
   *  or persisted on the chat message. Surfaced as a small badge
   *  below the response so users see "Strongly grounded" / "General
   *  knowledge" without clicking anything. */
  grounding?: { tier: "strong" | "partial" | "general" | "none"; score: number; summary: string } | null;
  onOpenEditor: (content: string) => void;
  onRewrite: (instruction: string) => void;
  onFollowup: (q: string) => void;
  rewriting: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const isDraft = looksLikeDraft(content);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const onExport = () => {
    const stem = deriveFilenameStem(content)
      .replace(/[^a-z0-9_-]+/gi, "_")
      .toLowerCase();
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stem}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="text-[var(--ink)]">
        <MarkdownRenderer content={content} trace={trace} citationReport={citationReport} />
      </div>

      {grounding && grounding.tier !== "none" && (
        <GroundingBadge grounding={grounding} />
      )}

      <div className="mt-4 flex items-center gap-3 text-xs text-[var(--ink-muted)]">
        <button onClick={onCopy} className="inline-flex items-center gap-1 hover:text-[var(--ink)]">
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={onExport} className="inline-flex items-center gap-1 hover:text-[var(--ink)]">
          <Download className="w-3 h-3" />
          Export
        </button>
        <div className="relative">
          <button
            onClick={() => setRewriteOpen((v) => !v)}
            disabled={rewriting}
            className="inline-flex items-center gap-1 hover:text-[var(--ink)] disabled:opacity-50"
          >
            {rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Rewrite
            <ChevronDown className="w-3 h-3" />
          </button>
          {rewriteOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] shadow-lg p-1 min-w-[160px]">
              {REWRITE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    onRewrite(p.instruction);
                    setRewriteOpen(false);
                  }}
                  className="block w-full text-left rounded-[3px] px-2 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {isDraft && (
          <button
            onClick={() => onOpenEditor(content)}
            className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
          >
            <FileText className="w-3 h-3" />
            Open in editor
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setFeedback(feedback === "up" ? null : "up")}
            className={`hover:text-[var(--ink)] ${feedback === "up" ? "text-[var(--ink)]" : ""}`}
            title="Helpful"
          >
            <ThumbsUp className="w-3 h-3" />
          </button>
          <button
            onClick={() => setFeedback(feedback === "down" ? null : "down")}
            className={`hover:text-[var(--ink)] ${feedback === "down" ? "text-[var(--ink)]" : ""}`}
            title="Not helpful"
          >
            <ThumbsDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      <AgentPlan trace={trace} />

      <SourcesBlock trace={trace} />

      {followups.length > 0 && (
        <div className="mt-6 pt-4 border-t border-[var(--rule)]">
          <div className="text-xs text-[var(--ink-muted)] mb-2">Follow-ups</div>
          <div className="space-y-1">
            {followups.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowup(q)}
                className="w-full text-left flex items-start gap-2 px-2 py-1.5 -mx-2 rounded-[4px] text-sm text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <ArrowRight
                  className="w-3.5 h-3.5 mt-1 text-[var(--ink-muted)] flex-shrink-0"
                  strokeWidth={1.5}
                />
                <span>{q}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sources block ───────────────────────────────────────────────

export function SourcesBlock({ trace }: { trace: unknown }) {
  const [open, setOpen] = useState(false);
  const map = buildCitationMap(
    Array.isArray(trace) ? (trace as Parameters<typeof buildCitationMap>[0]) : [],
  );
  const vault = Object.values(map.vault);
  const memory = Object.values(map.memory);
  const total = vault.length + memory.length;
  if (total === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <BookOpen className="w-3 h-3" strokeWidth={1.5} />
        Sources · {total}
      </button>
      {open && (
        <div className="mt-2 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-3 space-y-3">
          {vault.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] mb-1.5">
                Vault · {vault.length}
              </div>
              <div className="space-y-1">
                {vault.map((c, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-mono text-amber-700 dark:text-amber-300/90 mr-2">
                      {c.marker}
                    </span>
                    <span className="text-[var(--ink)] font-medium">{c.source}</span>
                    {c.page != null && (
                      <span className="text-[var(--ink-muted)]"> · p.{c.page}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {memory.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] mb-1.5">
                Memory · {memory.length}
              </div>
              <div className="space-y-1">
                {memory.map((c, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-mono text-cyan-700 dark:text-cyan-300/90 mr-2">
                      [mem:{c.short_id}]
                    </span>
                    <span className="text-[var(--ink-muted)]">{c.kind}</span>
                    {c.source_kind && (
                      <span className="text-[var(--ink-subtle)]"> · {c.source_kind}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live thinking ───────────────────────────────────────────────
// Harvey-style checklist of phases as they tick by. Each
// iteration_thinking event becomes one row; per-tool detail collapses
// in, the row gets a checkmark when its tools resolve.

export function LiveThinking({
  state,
  deep,
}: {
  state: StreamState;
  deep: boolean;
}) {
  type Phase = {
    summary: string;
    toolCount: number;
    pending: number;
  };
  const phases: Phase[] = [];
  let active: Phase | null = null;

  for (const ev of state.events) {
    if (ev.type === "iteration_thinking") {
      active = { summary: ev.summary || "Thinking…", toolCount: 0, pending: 0 };
      phases.push(active);
    } else if (ev.type === "tool_start") {
      if (!active) {
        active = { summary: "Working…", toolCount: 0, pending: 0 };
        phases.push(active);
      }
      active.toolCount += 1;
      active.pending += 1;
    } else if (ev.type === "tool_end") {
      if (!active) continue;
      active.pending = Math.max(0, active.pending - 1);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Working…
        {deep && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-[10px] text-[var(--ink)]">
            <Telescope className="w-2.5 h-2.5" />
            Deep
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {phases.map((phase, i) => {
          const isLast = i === phases.length - 1;
          const ticked = !isLast || (phase.toolCount > 0 && phase.pending === 0);
          return (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span
                className={
                  ticked
                    ? "text-emerald-600 dark:text-emerald-400 mt-0.5"
                    : "text-[var(--ink-subtle)] mt-0.5"
                }
                aria-hidden
              >
                {ticked ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
              </span>
              <span className="text-[var(--ink)] flex-1">{phase.summary}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Grounding badge ─────────────────────────────────────────────
//
// Phase 4 W4.9. Surfaces lib/dante/grounding.ts's tier as a small
// chip below the response. Strong = emerald; partial = amber;
// general = neutral. Click toggles the parts breakdown for users
// who want to know why the score is what it is.

function GroundingBadge({
  grounding,
}: {
  grounding: { tier: "strong" | "partial" | "general" | "none"; score: number; summary: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const tone =
    grounding.tier === "strong"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : grounding.tier === "partial"
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border-[var(--rule)]";
  const label =
    grounding.tier === "strong"
      ? "Strongly grounded"
      : grounding.tier === "partial"
        ? "Partially grounded"
        : "General knowledge";
  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] border text-[10px] font-medium ${tone}`}
        title={grounding.summary}
      >
        <span className="font-mono">{Math.round(grounding.score * 100)}</span>
        <span>{label}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 text-[11px] text-[var(--ink-muted)] leading-relaxed max-w-prose">
          {grounding.summary}
        </div>
      )}
    </div>
  );
}
