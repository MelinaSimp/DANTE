"use client";

// DraftEditor — the gold-standard revision-tracking editor surface.
//
// Inspired by Harvey's Draft Editor: an editable canvas plus a
// revision stack with a "Show Edits" toggle that diffs the current
// revision against the previous one (red strikethrough for deletions,
// green for additions). Natural-language revision prompts ("make it
// shorter", "add a force majeure clause") run through the same
// /api/dante/ask streaming agent the rest of D/V uses, so revisions
// inherit memory + vault grounding for free.
//
// Replaces the earlier DocumentPanel.tsx, which was a deliberate
// stub that called out revision tracking as deferred.
//
// Usage:
//
//   <DraftEditor
//     initialContent={draft}
//     filenameStem="follow-up-smith"
//     contextContactId={contact.id}
//     onApply={(content) => setBody(content)}
//     onClose={() => setOpen(false)}
//   />
//
// Lifecycle:
//   - Mount snapshots `initialContent` as the first revision (kind=
//     "initial"). Every AI revision and every manual edit (committed
//     on blur or explicit Snapshot) pushes a new revision.
//   - "Show Edits" diffs revisions[currentIdx] against
//     revisions[currentIdx-1].
//   - "Apply" returns revisions[currentIdx].content to the caller.
//   - The full revision stack stays local — we don't persist it
//     (yet); reopening a chat reseeds from the source content.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Copy,
  Download,
  Check,
  Loader2,
  Send,
  History,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
  ChevronRight,
  CornerUpLeft,
} from "lucide-react";
import {
  consumeAgentStream,
  initialStreamState,
  type StreamState,
} from "@/app/dante/streamClient";
import { useAssistantBrand } from "./AssistantNameProvider";
import { diffWords, diffStats, type DiffOp } from "@/lib/dante/diff";

type RevisionKind = "initial" | "ai" | "manual";

interface Revision {
  id: string;
  content: string;
  kind: RevisionKind;
  /** One-line description of how this revision was produced. AI
   *  revisions store the user's prompt; manual edits read "Edited
   *  by hand"; the initial revision reads "Initial draft". */
  label: string;
  createdAt: number;
}

interface Props {
  initialContent: string;
  /** Suggested filename stem; we'll append `.md` for download. */
  filenameStem?: string;
  /** Optional: scope AI revisions to a contact (default tool calls). */
  contextContactId?: string;
  contextContactName?: string;
  /** Optional: scope AI revisions to a property. */
  contextPropertyId?: string;
  contextPropertyLabel?: string;
  /** Called with the final content when the user clicks Apply.
   *  When omitted, no Apply button shows — the editor is read/copy
   *  only (e.g. when launched from a /dante chat where there's
   *  nothing to write back to). */
  onApply?: (content: string) => void;
  onClose: () => void;
}

const REVISION_PRESETS = [
  { label: "Make shorter", prompt: "Make it noticeably shorter — about half the length, same key facts." },
  { label: "More formal", prompt: "Rewrite in a more formal, client-facing tone." },
  { label: "More personal", prompt: "Make it warmer and more personal without losing professionalism." },
  { label: "Bullets", prompt: "Restructure as a bulleted list of the main points." },
  { label: "Tighter open", prompt: "Tighten the opening paragraph; cut filler." },
  { label: "Add deadline", prompt: "Add a clear next-step with a specific deadline (suggest one if needed)." },
] as const;

function newRevision(
  content: string,
  kind: RevisionKind,
  label: string,
): Revision {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content,
    kind,
    label,
    createdAt: Date.now(),
  };
}

export default function DraftEditor({
  initialContent,
  filenameStem,
  contextContactId,
  contextContactName,
  contextPropertyId,
  contextPropertyLabel,
  onApply,
  onClose,
}: Props) {
  const { name: assistantName } = useAssistantBrand();

  // Revision stack. Index 0 is always the initial; new revisions
  // append. The "current" pointer lets the user step back through
  // history without losing later revisions.
  const [revisions, setRevisions] = useState<Revision[]>(() => [
    newRevision(initialContent, "initial", "Initial draft"),
  ]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showEdits, setShowEdits] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  // Editing buffer — what's in the textarea. Becomes a "manual"
  // revision when the user explicitly snapshots, when the user
  // submits an AI revision (we snapshot before the AI run if the
  // buffer has drifted), or when the editor closes via Apply.
  const current = revisions[currentIdx];
  const [buffer, setBuffer] = useState(current.content);
  useEffect(() => {
    setBuffer(current.content);
  }, [current.content, current.id]);

  const bufferDirty = buffer !== current.content;

  // Streaming AI revision state.
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [stream, setStream] = useState<StreamState>(initialStreamState());
  const abortRef = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Esc closes (with confirm if there's a dirty manual buffer that
  // hasn't been snapshotted, so the user doesn't lose hand-edits).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (bufferDirty) {
          if (!confirm("You have unsaved manual edits. Close anyway?")) return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bufferDirty, onClose]);

  // Cancel in-flight stream on close.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const snapshotIfDirty = useCallback((): Revision[] => {
    if (!bufferDirty) return revisions;
    const snap = newRevision(buffer, "manual", "Edited by hand");
    // Truncate any "future" revisions if user stepped back, then
    // pushed an edit — we branch from current.
    const upToCurrent = revisions.slice(0, currentIdx + 1);
    const updated = [...upToCurrent, snap];
    setRevisions(updated);
    setCurrentIdx(updated.length - 1);
    return updated;
  }, [bufferDirty, buffer, revisions, currentIdx]);

  const runAiRevision = useCallback(
    async (userPrompt: string) => {
      const p = userPrompt.trim();
      if (!p || stream.streaming) return;

      // Snapshot any pending hand-edit first so the AI revises the
      // current visible state, not a stale revision.
      const pre = snapshotIfDirty();
      const baseContent = pre[pre.length - 1].content;

      setRevisionPrompt("");
      setStream({ ...initialStreamState(), streaming: true });
      const controller = new AbortController();
      abortRef.current = controller;

      const message = [
        "Here is the current email/document draft:",
        "",
        "---",
        baseContent,
        "---",
        "",
        `Revise it per this instruction: ${p}`,
        "",
        "Output JUST the revised text. No preamble like 'Here's the revised draft:'. Plain text or light markdown only. Do NOT include citation markers like [v1] or [mem:abc12345] in the output — these end up in client-facing copy.",
      ].join("\n");

      try {
        await consumeAgentStream({
          body: {
            message,
            context_contact_id: contextContactId,
            context_contact_name: contextContactName,
            context_property_id: contextPropertyId,
            context_property_label: contextPropertyLabel,
          },
          signal: controller.signal,
          onUpdate: (s) => setStream(s),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "request failed";
        setStream((s) => ({ ...s, streaming: false, error: msg }));
        return;
      }

      // Fold the streamed content into a new revision. Using the
      // functional setter avoids a stale-closure bug when the user
      // fires multiple revisions in quick succession.
      setStream((s) => {
        if (s.finalContent) {
          const cleaned = stripCitationMarkers(s.finalContent.trim());
          setRevisions((prev) => {
            const next = [...prev, newRevision(cleaned, "ai", p)];
            setCurrentIdx(next.length - 1);
            return next;
          });
        }
        return initialStreamState();
      });
    },
    [
      stream.streaming,
      snapshotIfDirty,
      contextContactId,
      contextContactName,
      contextPropertyId,
      contextPropertyLabel,
    ],
  );

  // ── Actions ─────────────────────────────────────────────────
  const apply = () => {
    if (!onApply) return;
    const finalContent = bufferDirty ? buffer : current.content;
    onApply(finalContent);
    onClose();
  };
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = bufferDirty ? buffer : current.content;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* swallow */
    }
  };
  const download = () => {
    const text = bufferDirty ? buffer : current.content;
    const stem = filenameStem || "draft";
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stem}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const revertToInitial = () => {
    if (revisions.length === 0) return;
    if (!confirm("Discard all revisions and return to the initial draft?")) return;
    setRevisions([revisions[0]]);
    setCurrentIdx(0);
    setBuffer(revisions[0].content);
  };
  const switchTo = (idx: number) => {
    if (bufferDirty) {
      if (!confirm("You have unsaved hand-edits. Discard them?")) return;
    }
    setCurrentIdx(idx);
    setShowEdits(false);
  };

  // ── Diff for "Show Edits" ────────────────────────────────────
  // We diff the current revision against its immediate predecessor —
  // matches Harvey's per-revision pattern. If currentIdx === 0 there's
  // nothing to diff; the toggle is disabled.
  const previous = currentIdx > 0 ? revisions[currentIdx - 1] : null;
  const diff: DiffOp[] = useMemo(() => {
    if (!previous) return [];
    return diffWords(previous.content, current.content);
  }, [previous, current]);
  const stats = useMemo(() => diffStats(diff), [diff]);

  // ── Render ───────────────────────────────────────────────────
  const showThinking = stream.streaming && !stream.finalContent;
  const livePreview = stream.streaming ? stream.finalContent : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-stretch bg-[var(--ink)]/30 backdrop-blur-sm sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex-1 max-w-6xl mx-auto bg-[var(--canvas)] sm:border border-[var(--rule)] sm:rounded-[8px] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--rule)]">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                <Sparkles className="w-3 h-3" strokeWidth={1.5} />
                <span>{assistantName} · Draft editor</span>
              </div>
              <div className="text-sm font-medium text-[var(--ink)] mt-0.5">
                {filenameStem || "Untitled draft"}{" "}
                <span className="text-[var(--ink-subtle)] mono ml-2">
                  rev {currentIdx + 1}/{revisions.length}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEdits((v) => !v)}
              disabled={!previous}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] text-xs font-medium transition disabled:opacity-30"
              style={{
                background: showEdits ? "var(--ink)" : "transparent",
                color: showEdits ? "var(--canvas)" : "var(--ink-muted)",
                border: showEdits
                  ? "1px solid var(--ink)"
                  : "1px solid var(--rule)",
              }}
              title={
                previous
                  ? `Diff against ${previous.kind === "initial" ? "initial draft" : `rev ${currentIdx}`}`
                  : "No previous revision"
              }
            >
              {showEdits ? (
                <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              Show edits
            </button>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="p-1.5 rounded text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
              title={showHistory ? "Hide revisions" : "Show revisions"}
            >
              <History className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
              title="Close (esc)"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Body — split: editor (left) + revision history sidebar (right). */}
        <div className="flex-1 flex min-h-0">
          {/* Editor canvas */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Edit-mode banner if showing diff. */}
            {showEdits && previous && (
              <div className="px-5 py-2 border-b border-[var(--rule)] bg-[var(--canvas-subtle)] flex items-center gap-3 text-[11px] text-[var(--ink-muted)]">
                <span>
                  Diff vs.{" "}
                  <span className="text-[var(--ink)]">
                    {previous.kind === "initial"
                      ? "initial draft"
                      : `rev ${currentIdx}`}
                  </span>
                </span>
                <span className="text-[var(--ink-subtle)]">·</span>
                <span className="text-[var(--verified)]">
                  +{stats.added}
                </span>
                <span className="text-[var(--danger)]">−{stats.removed}</span>
                <span className="ml-auto text-[10px] mono uppercase tracking-wider">
                  {current.label}
                </span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {showEdits && previous ? (
                <DiffView ops={diff} />
              ) : (
                <textarea
                  ref={textareaRef}
                  value={buffer}
                  onChange={(e) => setBuffer(e.target.value)}
                  onBlur={() => {
                    // Auto-snapshot on blur if the user hand-edited —
                    // matches Harvey's "edits become revisions" pattern
                    // without making the user click a Save button.
                    if (bufferDirty) snapshotIfDirty();
                  }}
                  className="w-full h-full min-h-[400px] resize-none bg-transparent text-[15px] text-[var(--ink)] leading-relaxed font-sans focus:outline-none"
                  placeholder="Empty draft — type or ask for a revision below."
                />
              )}

              {/* Live preview while a revision is streaming. */}
              {stream.streaming && (
                <div className="mt-4 rounded-[4px] border border-dashed border-[var(--rule-strong)] bg-[var(--canvas-subtle)] px-4 py-3">
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                    {showThinking
                      ? streamingStatus(stream)
                      : "Streaming revision…"}
                  </div>
                  {livePreview && (
                    <div className="text-[14px] text-[var(--ink)] leading-relaxed whitespace-pre-wrap">
                      {livePreview}
                    </div>
                  )}
                </div>
              )}
              {stream.error && (
                <div className="mt-4 px-3 py-2 text-xs text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px]">
                  {stream.error}
                </div>
              )}
            </div>

            {/* Footer composer — natural-language revision prompt. */}
            <div className="border-t border-[var(--rule)] px-5 py-3 space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runAiRevision(revisionPrompt);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={promptRef}
                  value={revisionPrompt}
                  onChange={(e) => setRevisionPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      runAiRevision(revisionPrompt);
                    }
                  }}
                  rows={1}
                  placeholder={`Ask ${assistantName} to revise — e.g. "make it warmer", "add a deadline", "tighten the opening"`}
                  className="flex-1 resize-none bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)] max-h-32"
                />
                <button
                  type="submit"
                  disabled={!revisionPrompt.trim() || stream.streaming}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 transition"
                  title="Run revision"
                >
                  {stream.streaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Send className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>
              </form>

              {/* Preset chips — quick revisions matching common asks. */}
              <div className="flex flex-wrap gap-1.5">
                {REVISION_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    disabled={stream.streaming}
                    onClick={() => runAiRevision(p.prompt)}
                    className="px-2.5 py-1 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-40 transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {onApply && (
                  <button
                    onClick={apply}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-semibold hover:opacity-90 transition"
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Apply{bufferDirty ? " (with edits)" : ""}
                  </button>
                )}
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs text-[var(--ink)] transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={download}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs text-[var(--ink)] transition"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                  .md
                </button>
                {revisions.length > 1 && (
                  <button
                    onClick={revertToInitial}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs text-[var(--ink-muted)] hover:text-[var(--danger)] transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Discard revisions
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Revision history sidebar */}
          {showHistory && (
            <aside className="w-64 shrink-0 border-l border-[var(--rule)] bg-[var(--canvas-subtle)] flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-[var(--rule)] text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                Revisions
              </div>
              <ul className="flex-1 overflow-y-auto py-1">
                {revisions.map((r, idx) => {
                  const active = idx === currentIdx;
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => switchTo(idx)}
                        className="w-full text-left px-4 py-2.5 transition border-l-2"
                        style={{
                          background: active
                            ? "var(--canvas)"
                            : "transparent",
                          borderColor: active ? "var(--ink)" : "transparent",
                        }}
                      >
                        <div className="flex items-center gap-1.5 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-0.5">
                          <span>rev {idx + 1}</span>
                          <ChevronRight className="w-2.5 h-2.5" strokeWidth={1.5} />
                          <span>
                            {r.kind === "initial"
                              ? "initial"
                              : r.kind === "manual"
                              ? "edit"
                              : assistantName.toLowerCase()}
                          </span>
                        </div>
                        <div
                          className="text-xs text-[var(--ink)] leading-snug"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const,
                            overflow: "hidden",
                          }}
                        >
                          {r.label}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {currentIdx > 0 && (
                <div className="px-4 py-3 border-t border-[var(--rule)]">
                  <button
                    onClick={() => switchTo(currentIdx - 1)}
                    className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
                  >
                    <CornerUpLeft className="w-3 h-3" strokeWidth={1.5} />
                    Step back one revision
                  </button>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function streamingStatus(stream: StreamState): string {
  if (stream.events.length === 0) return "Drafting…";
  const last = stream.events[stream.events.length - 1];
  if (last.type === "tool_start") return `Calling ${last.tool_name}…`;
  if (last.type === "tool_end") return `${last.tool_name} → ${last.status}`;
  if (last.type === "iteration_thinking")
    return last.summary || `Drafting (step ${last.iteration})…`;
  return "Drafting…";
}

// Renders a diff op-list as inline spans. Same text passes through as
// plain; additions render in green/blue; deletions render with red
// strikethrough. Whitespace tokens preserve layout faithfully.
function DiffView({ ops }: { ops: DiffOp[] }) {
  return (
    <div className="text-[15px] leading-relaxed font-sans whitespace-pre-wrap">
      {ops.map((op, i) => {
        if (op.type === "same") {
          return (
            <span key={i} className="text-[var(--ink)]">
              {op.text}
            </span>
          );
        }
        if (op.type === "added") {
          return (
            <span
              key={i}
              className="bg-[var(--verified-soft)] text-[var(--verified)] underline decoration-1 decoration-[var(--verified)] underline-offset-2"
            >
              {op.text}
            </span>
          );
        }
        return (
          <span
            key={i}
            className="bg-[var(--danger-soft)] text-[var(--danger)] line-through decoration-1 decoration-[var(--danger)]"
          >
            {op.text}
          </span>
        );
      })}
    </div>
  );
}

// Defensive scrub of internal citation markers — same logic as
// DraftWithAssistant.stripCitations. Kept inline so DraftEditor is
// self-contained when imported elsewhere.
function stripCitationMarkers(text: string): string {
  return text
    .replace(/\[v\d+\]/g, "")
    .replace(/\[mem:[a-f0-9]+\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
