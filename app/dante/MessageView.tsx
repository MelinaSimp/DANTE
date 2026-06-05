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
import { LumaSpin } from "@/components/ui/luma-spin";
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
  ShieldCheck,
} from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import { looksLikeDraft, deriveFilenameStem } from "./DocumentPanel";
import type { StreamState, CitationReportState, DocumentArtifact } from "./streamClient";
import { buildCitationMap } from "@/lib/dante/citations";
import AgentPlan from "@/components/dante/AgentPlan";
import ReasoningDisclosure from "@/components/dante/ReasoningDisclosure";
import DocumentCard from "@/components/dante/DocumentCard";

const REWRITE_PRESETS = [
  { label: "Shorter", instruction: "Make it shorter — half the length, same key facts." },
  { label: "Bullets", instruction: "Rewrite as a bulleted list." },
  { label: "More formal", instruction: "Rewrite in a more formal, client-facing tone." },
  { label: "Add example", instruction: "Add a concrete example illustrating the main point." },
] as const;

// ── User message ────────────────────────────────────────────────

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="w-full flex justify-end">
      <div className="max-w-[80%] glass-card rounded-xl px-4 py-3">
        <p className="text-sm text-[var(--ink)] whitespace-pre-wrap">{content}</p>
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
  documents,
  onOpenEditor,
  onRewrite,
  onFollowup,
  rewriting,
  chatId,
  messageId,
  contactId,
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
  /** Documents generated during this turn by document.create or
   *  document.edit tools. Rendered as inline cards below the message. */
  documents?: DocumentArtifact[];
  onOpenEditor: (content: string) => void;
  onRewrite: (instruction: string) => void;
  onFollowup: (q: string) => void;
  rewriting: boolean;
  /** Optional context for the "Queue for review" action — if provided,
   *  the queued payload deep-links back to the originating chat for the
   *  reviewer. AskDante (ephemeral) leaves this undefined; ChatThread
   *  passes its persisted ids. */
  chatId?: string;
  messageId?: string;
  contactId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [queueState, setQueueState] = useState<"idle" | "queueing" | "queued" | "error">("idle");
  const isDraft = looksLikeDraft(content);

  const onQueueForReview = async () => {
    if (queueState !== "idle") return;
    setQueueState("queueing");
    try {
      const res = await fetch("/api/dante/queue-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, chatId, messageId, contactId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setQueueState("queued");
      setTimeout(() => setQueueState("idle"), 3500);
    } catch {
      setQueueState("error");
      setTimeout(() => setQueueState("idle"), 3500);
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const onExportMarkdown = () => {
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
    setExportOpen(false);
  };

  const onExportPdf = async () => {
    if (!chatId || !messageId) {
      // Fallback to markdown for ephemeral chats without IDs
      onExportMarkdown();
      return;
    }
    setExporting(true);
    setExportOpen(false);
    try {
      const res = await fetch("/api/dante/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, messageIds: [messageId] }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drift-export-${chatId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[pdf-export]", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Machinery first — collapsed strips that show "what Dante did
       *  and why" before the answer itself. Both default closed; the
       *  user reads the answer first unless they want the work shown.
       *  This ordering matches the regulated-professional UX: provenance
       *  is always one click away, never two. */}
      <ReasoningDisclosure trace={trace} />
      <AgentPlan trace={trace} />

      <div className="mt-5 text-[var(--ink)] font-serif text-[15px] leading-[1.75] prose prose-sm max-w-none">
        <MarkdownRenderer content={content} trace={trace} citationReport={citationReport} />
      </div>

      {documents && documents.length > 0 && (
        <div className="mt-4">
          {documents.map((doc) => (
            <DocumentCard key={doc.vault_item_id} doc={doc} />
          ))}
        </div>
      )}

      {grounding && grounding.tier !== "none" && (
        <GroundingBadge grounding={grounding} />
      )}

      <div className="mt-6 flex items-center gap-3 text-xs text-[var(--ink-subtle)] flex-wrap">
        <button onClick={onCopy} className="p-1.5 rounded text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] hover:bg-[var(--neu-hover)]">
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <div className="relative">
          <button
            onClick={() => setExportOpen((v) => !v)}
            disabled={exporting}
            className="inline-flex items-center gap-1 hover:text-[var(--ink-muted)] disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Export
            <ChevronDown className="w-3 h-3" />
          </button>
          {exportOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 glass-card rounded-lg p-1 min-w-[140px]">
              <button
                onClick={onExportPdf}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--neu-hover)] rounded-md"
              >
                PDF (branded)
              </button>
              <button
                onClick={onExportMarkdown}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--neu-hover)] rounded-md"
              >
                Markdown
              </button>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setRewriteOpen((v) => !v)}
            disabled={rewriting}
            className="inline-flex items-center gap-1 hover:text-[var(--ink-muted)] disabled:opacity-50"
          >
            {rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Rewrite
            <ChevronDown className="w-3 h-3" />
          </button>
          {rewriteOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 glass-card rounded-lg p-1 min-w-[160px]">
              {REWRITE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    onRewrite(p.instruction);
                    setRewriteOpen(false);
                  }}
                  className="block w-full text-left rounded-md px-2 py-1.5 text-xs text-[var(--ink-muted)] hover:bg-[var(--neu-hover)]"
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
            className="inline-flex items-center gap-1 hover:text-[var(--ink-muted)]"
          >
            <FileText className="w-3 h-3" />
            Open in editor
          </button>
        )}
        <button
          onClick={onQueueForReview}
          disabled={queueState !== "idle"}
          className="inline-flex items-center gap-1 hover:text-[var(--ink-muted)] disabled:opacity-60"
          title="Stage this response for principal/supervisor review"
        >
          {queueState === "queueing" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : queueState === "queued" ? (
            <Check className="w-3 h-3 text-green-600" />
          ) : (
            <ShieldCheck className="w-3 h-3" />
          )}
          {queueState === "queued"
            ? "Queued"
            : queueState === "error"
              ? "Failed"
              : "Queue for review"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setFeedback(feedback === "up" ? null : "up")}
            className={`hover:text-[var(--ink-muted)] ${feedback === "up" ? "text-[var(--ink)]" : ""}`}
            title="Helpful"
          >
            <ThumbsUp className="w-3 h-3" />
          </button>
          <button
            onClick={() => setFeedback(feedback === "down" ? null : "down")}
            className={`hover:text-[var(--ink-muted)] ${feedback === "down" ? "text-[var(--ink)]" : ""}`}
            title="Not helpful"
          >
            <ThumbsDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      <SourcesBlock trace={trace} />

      {followups.length > 0 && (
        <div className="mt-8 pt-5 border-t border-black/[0.06]">
          <div className="text-xs text-[var(--ink-subtle)] mb-3">Follow-ups</div>
          <div className="space-y-1.5">
            {followups.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowup(q)}
                className="w-full text-left flex items-start gap-2 px-2 py-1.5 -mx-2 rounded-md text-sm text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] transition"
              >
                <ArrowRight
                  className="w-3.5 h-3.5 mt-1 text-[var(--ink-subtle)] flex-shrink-0"
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

// ── Sources block — compact Perplexity-style row ────────────────
//
// Shows a row of small source pills (first letter of each source)
// with a total count. Clicking the count expands the full list.
// Vault sources show the document icon; memory sources show a
// brain-like dot. Compact by default, expandable on demand.

export function SourcesBlock({ trace }: { trace: unknown }) {
  const [open, setOpen] = useState(false);
  const map = buildCitationMap(
    Array.isArray(trace) ? (trace as Parameters<typeof buildCitationMap>[0]) : [],
  );
  const vault = Object.values(map.vault);
  const memory = Object.values(map.memory);
  const total = vault.length + memory.length;
  if (total === 0) return null;

  // De-duplicate vault sources by document_id so each doc shows once
  const uniqueVault = vault.filter(
    (v, i, arr) =>
      !v.document_id || arr.findIndex((x) => x.document_id === v.document_id) === i,
  );

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--rule)] px-3 py-1.5 hover:bg-[var(--canvas-subtle)] transition"
      >
        {/* Source avatar circles */}
        <span className="flex -space-x-1.5">
          {uniqueVault.slice(0, 4).map((v, i) => (
            <span
              key={`v${i}`}
              className="w-5 h-5 rounded-full bg-amber-100 border-2 border-[var(--canvas)] flex items-center justify-center text-[9px] font-semibold text-amber-700"
              title={v.source || "Vault"}
            >
              {(v.source || "V")[0].toUpperCase()}
            </span>
          ))}
          {memory.length > 0 && uniqueVault.length < 4 && (
            <span className="w-5 h-5 rounded-full bg-cyan-100 border-2 border-[var(--canvas)] flex items-center justify-center text-[9px] font-semibold text-cyan-700" title="Memory">
              M
            </span>
          )}
          {total > 5 && (
            <span className="w-5 h-5 rounded-full bg-[var(--canvas-subtle)] border-2 border-[var(--canvas)] flex items-center justify-center text-[9px] font-medium text-[var(--ink-subtle)]">
              +{total - 4}
            </span>
          )}
        </span>
        <span className="text-xs text-[var(--ink-muted)]">{total} source{total === 1 ? "" : "s"}</span>
        {open ? <ChevronDown className="w-3 h-3 text-[var(--ink-subtle)]" /> : <ChevronRight className="w-3 h-3 text-[var(--ink-subtle)]" />}
      </button>

      {open && (
        <div className="mt-2 glass-card rounded-lg p-3 space-y-3">
          {vault.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mb-1.5">
                Vault · {vault.length}
              </div>
              <div className="space-y-1">
                {vault.map((c, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center text-[8px] font-semibold text-amber-700 shrink-0">
                      {(c.source || "V")[0].toUpperCase()}
                    </span>
                    <span className="text-[var(--ink)] font-medium truncate">{c.source}</span>
                    {c.page != null && (
                      <span className="text-[var(--ink-subtle)] shrink-0">p.{c.page}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {memory.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mb-1.5">
                Memory · {memory.length}
              </div>
              <div className="space-y-1">
                {memory.map((c, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-100 flex items-center justify-center text-[8px] font-semibold text-cyan-700 shrink-0">
                      M
                    </span>
                    <span className="text-[var(--ink-subtle)]">{c.kind}</span>
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
// Simple collapsible card showing what the agent is doing. Each
// iteration_thinking and tool event becomes a short text line.

export function LiveThinking({
  state,
  deep,
}: {
  state: StreamState;
  deep: boolean;
}) {
  const [open, setOpen] = useState(true);
  const steps = thinkingSteps(state.events);

  return (
    <div className="glass-card rounded-lg">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--ink-subtle)]"
      >
        <LumaSpin size={14} className="text-[var(--ink-muted)]" />
        <span className="font-medium text-[var(--ink-muted)]">Working…</span>
        {deep && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--neu-hover)] px-2 py-0.5 text-[10px] text-[var(--ink-muted)]">
            <Telescope className="w-2.5 h-2.5" />
            Deep
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3 h-3 ml-auto text-[var(--ink-subtle)]" />
        ) : (
          <ChevronRight className="w-3 h-3 ml-auto text-[var(--ink-subtle)]" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-2.5 space-y-1">
          {steps.length === 0 ? (
            <p className="text-xs text-[var(--ink-subtle)]">Reading the question…</p>
          ) : (
            steps.map((s, i) => (
              <p key={i} className="text-xs text-[var(--ink-subtle)] leading-relaxed">
                {s}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function thinkingSteps(events: StreamState["events"]): string[] {
  const lines: string[] = [];
  for (const ev of events) {
    if (ev.type === "iteration_thinking" && ev.summary) {
      lines.push(ev.summary);
    } else if (ev.type === "tool_start" && ev.summary) {
      lines.push(ev.summary);
    } else if (ev.type === "tool_end" && ev.summary) {
      lines.push(ev.summary);
    }
  }
  return lines;
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
