"use client";

// app/dante/AskDante.tsx
//
// Harvey-style centered chat surface with a working toolbar:
//   - Prompts dropdown          (saved quick prompts)
//   - Customize                 (AI-rewrite the prompt before send)
//   - Improve                   (AI-rewrite the answer after send)
//   - Deep research toggle      (bumps max_steps + iterative system note)
//   - Files                     (placeholder; needs upload pipeline)
//
// All four functional buttons hit /api/dante/refine or just toggle
// state; Files is the only one still disabled because file upload
// isn't wired yet.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Library,
  Sliders,
  Wand2,
  Telescope,
  Database,
  BookOpen,
  Users,
  CalendarDays,
  History,
  FileText,
} from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import DocumentPanel, { looksLikeDraft, deriveFilenameStem } from "./DocumentPanel";
import {
  consumeAgentStream,
  type StreamState,
  initialStreamState,
} from "./streamClient";

interface RecentChat {
  id: string;
  title: string;
  updated_at: string;
}

const QUICK_PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: "Brief me on a client",
    prompt:
      "Brief me on [client name] — pull recent context from memory and surface anything I previously promised them, recent concerns from email, and one personal detail to open with.",
  },
  {
    label: "Summarize recent emails",
    prompt:
      "Summarize the last 14 days of emails with [client name]. Focus on concerns raised, commitments either side made, and anything still open.",
  },
  {
    label: "Prep for a meeting",
    prompt:
      "I have a meeting with [client name] in 30 minutes. What should I know going in?",
  },
  {
    label: "Find at-risk clients",
    prompt:
      "Which clients have I not contacted in over 60 days? Pull the list and flag anyone with negative recent signal.",
  },
];

const KNOWLEDGE_SOURCES = [
  { label: "Memory", icon: Database },
  { label: "Vault", icon: BookOpen },
  { label: "Contacts", icon: Users },
  { label: "Calendar", icon: CalendarDays },
] as const;

// Prefab "Improve" instructions surfaced as one-click buttons in
// the post-answer dropdown. Custom instruction is also possible.
const IMPROVE_PRESETS = [
  { label: "Shorter", instruction: "Make it shorter — half the length, same key facts." },
  { label: "Bullets", instruction: "Rewrite as a bulleted list." },
  { label: "More formal", instruction: "Rewrite in a more formal, client-facing tone." },
  { label: "Add example", instruction: "Add a concrete example illustrating the main point." },
] as const;

export default function AskDante() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState());
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [refining, setRefining] = useState<"customize" | "improve" | null>(null);
  const [improveOpen, setImproveOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/chats");
      const json = await res.json();
      setRecent((json.chats || []) as RecentChat[]);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    refreshRecent();
    return () => abortRef.current?.abort();
  }, [refreshRecent]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const submit = async () => {
    const message = input.trim();
    if (!message || streamState.streaming) return;

    abortRef.current = new AbortController();
    setTraceOpen(false);
    setImproveOpen(false);
    setStreamState({ ...initialStreamState(), streaming: true });

    try {
      await consumeAgentStream({
        body: { message, deep: deepResearch },
        signal: abortRef.current.signal,
        onUpdate: (next) => setStreamState(next),
      });
      setInput("");
      refreshRecent();
    } catch (err) {
      setStreamState((prev) => ({
        ...prev,
        streaming: false,
        error: err instanceof Error ? err.message : "request_failed",
      }));
    }
  };

  // Customize — rewrite the current input via /api/dante/refine.
  // No-op if the textarea is empty.
  const onCustomize = async () => {
    const text = input.trim();
    if (!text || refining) return;
    setRefining("customize");
    try {
      const res = await fetch("/api/dante/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "prompt", text }),
      });
      const json = await res.json();
      if (res.ok && json.text) {
        setInput(json.text);
        textareaRef.current?.focus();
      }
    } catch {
      /* swallow — toolbar refinement is best-effort */
    } finally {
      setRefining(null);
    }
  };

  // Improve — rewrite the current answer per a chosen instruction.
  // We do it in-place: replace finalContent with the rewritten text
  // so the citation chips still resolve from the same trace.
  const onImprove = async (instruction: string) => {
    const text = streamState.finalContent;
    if (!text || refining) return;
    setRefining("improve");
    setImproveOpen(false);
    try {
      const res = await fetch("/api/dante/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "answer", text, instruction }),
      });
      const json = await res.json();
      if (res.ok && json.text) {
        setStreamState((prev) => ({ ...prev, finalContent: json.text }));
      }
    } catch {
      /* swallow */
    } finally {
      setRefining(null);
    }
  };

  const usePrompt = (prompt: string) => {
    setInput(prompt);
    setPromptsOpen(false);
    textareaRef.current?.focus();
  };

  const showResult = !!streamState.finalContent || streamState.events.length > 0;
  const hasResultOrTrace = streamState.streaming || showResult;

  return (
    <div className="w-full max-w-[760px] mx-auto">
      {/* Wordmark — single bold "D" */}
      {!hasResultOrTrace && (
        <div className="text-center mb-8">
          <h1 className="heading-display text-7xl md:text-8xl text-[var(--ink)] font-bold tracking-tight leading-none">
            D
          </h1>
        </div>
      )}

      {/* Scope row — Harvey-style placeholder pills */}
      {!hasResultOrTrace && (
        <div className="flex items-center justify-center gap-4 mb-3 text-xs text-[var(--ink-muted)]">
          <button
            disabled
            className="inline-flex items-center gap-1.5 hover:text-[var(--ink)] disabled:cursor-not-allowed"
            title="Coming soon"
          >
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
            Choose vault
          </button>
          <button
            disabled
            className="inline-flex items-center gap-1.5 hover:text-[var(--ink)] disabled:cursor-not-allowed"
            title="Coming soon"
          >
            <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
            Set client context
          </button>
        </div>
      )}

      {/* Input — soft rounded card with toolbar inline */}
      <div className="rounded-[12px] border border-[var(--rule)] bg-[var(--canvas-subtle)] shadow-sm">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask Dante anything…"
          disabled={streamState.streaming}
          rows={hasResultOrTrace ? 2 : 4}
          className="w-full resize-none bg-transparent px-5 py-4 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--rule)]/60">
          {/* Left toolbar */}
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={Paperclip} label="Files" disabled tip="Coming soon" />
            <ToolbarButton
              icon={Library}
              label="Prompts"
              active={promptsOpen}
              onClick={() => setPromptsOpen((v) => !v)}
            />
            <ToolbarButton
              icon={Sliders}
              label="Customize"
              loading={refining === "customize"}
              disabled={!input.trim() || streamState.streaming}
              tip="AI-rewrite this prompt to be more specific"
              onClick={onCustomize}
            />
          </div>
          {/* Right toolbar */}
          <div className="flex items-center gap-2">
            <ToolbarButton
              icon={Telescope}
              label="Deep research"
              active={deepResearch}
              tip={
                deepResearch
                  ? "On — agent will iterate (up to 20 steps)"
                  : "Off — switch on for thorough multi-step research"
              }
              onClick={() => setDeepResearch((v) => !v)}
            />
            <button
              onClick={submit}
              disabled={!input.trim() || streamState.streaming}
              className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 font-medium"
            >
              {streamState.streaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {streamState.streaming ? "Thinking…" : "Ask Dante"}
            </button>
          </div>
        </div>

        {/* Prompts dropdown */}
        {promptsOpen && (
          <div className="border-t border-[var(--rule)]/60 px-3 py-3 bg-[var(--canvas)]/40">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] mb-2">
              Quick prompts
            </div>
            <div className="space-y-1">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  onClick={() => usePrompt(q.prompt)}
                  className="block w-full text-left rounded-[4px] px-2 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Knowledge source pills */}
      {!hasResultOrTrace && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {KNOWLEDGE_SOURCES.map((s) => {
            const Icon = s.icon;
            return (
              <span
                key={s.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule)] bg-[var(--canvas)] px-3 py-1.5 text-xs text-[var(--ink)]"
              >
                <Icon className="w-3 h-3" strokeWidth={1.5} />
                {s.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Live trace */}
      {streamState.streaming && streamState.events.length > 0 && (
        <LiveTrace state={streamState} deep={deepResearch} />
      )}

      {/* Result */}
      {showResult && !streamState.streaming && (
        <div className="mt-6 rounded-[8px] border border-[var(--rule)] bg-[var(--canvas)] p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-[var(--ink-muted)]">Dante</div>
            <div className="flex items-center gap-1.5">
              {/* Open in editor — only when content looks like a draft */}
              {looksLikeDraft(streamState.finalContent) && (
                <button
                  onClick={() => setEditorOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] px-2 py-1 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                  title="Open as editable document"
                >
                  <FileText className="w-3 h-3" strokeWidth={1.5} />
                  Open in editor
                </button>
              )}
              {/* Improve button — opens dropdown of preset rewrites */}
              <div className="relative">
                <button
                  onClick={() => setImproveOpen((v) => !v)}
                  disabled={refining === "improve"}
                  className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] px-2 py-1 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)] disabled:opacity-50"
                  title="Refine this answer"
                >
                  {refining === "improve" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3" strokeWidth={1.5} />
                  )}
                  Improve
                  <ChevronDown className="w-3 h-3" />
                </button>
                {improveOpen && (
                  <div className="absolute right-0 top-full mt-1 z-10 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] shadow-lg p-1 min-w-[160px]">
                    {IMPROVE_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => onImprove(p.instruction)}
                        className="block w-full text-left rounded-[3px] px-2 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <MarkdownRenderer
            content={streamState.finalContent || "(no response)"}
            trace={streamState.trace}
          />

          {Array.isArray(streamState.trace) && streamState.trace.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--rule)]">
              <button
                onClick={() => setTraceOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                {traceOpen ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                Finished in {streamState.trace.length} step
                {streamState.trace.length === 1 ? "" : "s"}
              </button>
              {traceOpen && (
                <div className="mt-3 space-y-1.5">
                  {streamState.trace.map((t) => (
                    <div
                      key={t.step_id}
                      className="text-xs rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[var(--ink)]">
                          {t.step_name}
                        </span>
                        <span
                          className={
                            t.status === "error"
                              ? "text-red-300"
                              : "text-emerald-300/80"
                          }
                        >
                          {t.status}
                        </span>
                      </div>
                      {t.error && (
                        <div className="text-red-300/90">{t.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {streamState.chatId && (
            <div className="mt-4 pt-4 border-t border-[var(--rule)] text-xs">
              <button
                onClick={() => router.push(`/dante/chat/${streamState.chatId}`)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] underline"
              >
                Continue this conversation →
              </button>
            </div>
          )}
        </div>
      )}

      {streamState.error && !streamState.streaming && (
        <div className="mt-4 rounded-[4px] border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {streamState.error}
        </div>
      )}

      {/* Document editor drawer — opens when user clicks "Open in editor"
          on a draft-shaped response. */}
      {editorOpen && (
        <DocumentPanel
          initialContent={streamState.finalContent}
          filenameStem={deriveFilenameStem(streamState.finalContent)}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {/* History collapsible */}
      {!hasResultOrTrace && (
        <div className="mt-12">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <History className="w-3 h-3" />
            Recent
            {historyOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
          {historyOpen && (
            <div className="mt-3 max-w-[480px] mx-auto">
              {recent.length === 0 ? (
                <div className="text-xs text-[var(--ink-subtle)] text-center">
                  No chats yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {recent.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => router.push(`/dante/chat/${c.id}`)}
                      className="w-full text-left rounded-[4px] px-3 py-2 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition truncate"
                      title={c.title}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Toolbar button ──────────────────────────────────────────────
// Three states: active (highlighted), disabled (faded, locked),
// default (high-contrast text). Loading swaps the icon for a spinner.

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  loading,
  tip,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  tip?: string;
  onClick?: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-xs transition disabled:cursor-not-allowed";
  const palette = active
    ? "bg-[var(--ink)] text-[var(--canvas)]"
    : disabled
      ? "text-[var(--ink-muted)] opacity-40"
      : "text-[var(--ink)] hover:bg-[var(--canvas)]/60";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={tip}
      className={`${base} ${palette}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      )}
      {label}
    </button>
  );
}

// ── Live trace ──────────────────────────────────────────────────

function LiveTrace({ state, deep }: { state: StreamState; deep: boolean }) {
  return (
    <div className="mt-6 rounded-[8px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--ink)] mb-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Working…
        {deep && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--ink)]/10 px-2 py-0.5 text-[10px] text-[var(--ink-muted)]">
            <Telescope className="w-2.5 h-2.5" />
            Deep
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {state.events.map((e, i) => (
          <LiveTraceRow key={i} event={e} />
        ))}
      </div>
    </div>
  );
}

function LiveTraceRow({
  event,
}: {
  event: StreamState["events"][number];
}) {
  if (event.type === "iteration_thinking") {
    return (
      <div className="text-xs text-[var(--ink-muted)] flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-[var(--ink-muted)]" />
        Thinking about next step…
      </div>
    );
  }
  if (event.type === "tool_start") {
    return (
      <div className="text-xs text-[var(--ink)] flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="font-mono">{prettifyToolName(event.tool_name)}</span>
        {event.summary && (
          <span className="text-[var(--ink-muted)]">— {event.summary}</span>
        )}
      </div>
    );
  }
  // tool_end
  const ok = event.status === "success";
  return (
    <div className="text-xs flex items-center gap-2">
      <span className={ok ? "text-emerald-300/80" : "text-red-300"} aria-hidden>
        {ok ? "✓" : "✗"}
      </span>
      <span className="font-mono text-[var(--ink)]">
        {prettifyToolName(event.tool_name)}
      </span>
      {event.summary && (
        <span className="text-[var(--ink-muted)]">— {event.summary}</span>
      )}
    </div>
  );
}

function prettifyToolName(raw: string): string {
  if (raw.startsWith("mcp__")) {
    const parts = raw.slice(5).split("__");
    return `${parts[0]} · ${(parts[1] || "").replace(/_/g, ".")}`;
  }
  return raw.replace(/_/g, ".");
}

