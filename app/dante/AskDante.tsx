"use client";

// app/dante/AskDante.tsx
//
// Harvey-style centered chat surface. The input is the page —
// everything else (recent chats, surfaces, recommended skills)
// flows below it. Streaming agent loop renders a live "Working…"
// trace that gets replaced by the final answer when the stream
// completes. Citations in the output are clickable chips via
// CitationRenderer.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Loader2,
  Sparkles,
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
} from "lucide-react";
import CitationRenderer from "./CitationRenderer";
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

// Knowledge sources rendered as pills below the input. Visual cue
// that Dante has these tools available — clicking a pill could
// scope the query to that source in a future iteration. For Phase 4a
// they're informational chips.
const KNOWLEDGE_SOURCES = [
  { label: "Memory", icon: Database },
  { label: "Vault", icon: BookOpen },
  { label: "Contacts", icon: Users },
  { label: "Calendar", icon: CalendarDays },
] as const;

export default function AskDante() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState());
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
    setStreamState({ ...initialStreamState(), streaming: true });

    try {
      await consumeAgentStream({
        body: { message },
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

  const usePrompt = (prompt: string) => {
    setInput(prompt);
    setPromptsOpen(false);
    textareaRef.current?.focus();
  };

  const showResult = !!streamState.finalContent || streamState.events.length > 0;
  const hasResultOrTrace = streamState.streaming || showResult;

  return (
    <div className="w-full max-w-[760px] mx-auto">
      {/* Wordmark hero — centered, like Harvey's "Harvey" title */}
      {!hasResultOrTrace && (
        <div className="text-center mb-8">
          <h1 className="heading-display text-5xl md:text-6xl text-[var(--ink)] tracking-tight">
            Dante
          </h1>
        </div>
      )}

      {/* Scope row — Harvey shows "Choose vault" / "Set client matter".
          We mirror with informational chips that hint at the active
          context. Not interactive yet; placeholder for Phase 4b. */}
      {!hasResultOrTrace && (
        <div className="flex items-center justify-center gap-4 mb-3 text-xs text-[var(--ink-subtle)]">
          <button
            disabled
            className="inline-flex items-center gap-1.5 hover:text-[var(--ink-muted)] disabled:cursor-not-allowed"
            title="Coming soon"
          >
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
            Choose vault
          </button>
          <button
            disabled
            className="inline-flex items-center gap-1.5 hover:text-[var(--ink-muted)] disabled:cursor-not-allowed"
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
          {/* Left toolbar — Files / Prompts / Customize / Improve */}
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={Paperclip} label="Files" disabled tip="Coming soon" />
            <ToolbarButton
              icon={Library}
              label="Prompts"
              active={promptsOpen}
              onClick={() => setPromptsOpen((v) => !v)}
            />
            <ToolbarButton icon={Sliders} label="Customize" disabled tip="Coming soon" />
            <ToolbarButton icon={Wand2} label="Improve" disabled tip="Coming soon" />
          </div>
          {/* Right toolbar — Deep research + Ask Dante */}
          <div className="flex items-center gap-2">
            <ToolbarButton
              icon={Telescope}
              label="Deep research"
              disabled
              tip="Coming soon"
            />
            <button
              onClick={submit}
              disabled={!input.trim() || streamState.streaming}
              className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--canvas)] hover:opacity-90 disabled:opacity-40"
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
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mb-2">
              Quick prompts
            </div>
            <div className="space-y-1">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  onClick={() => usePrompt(q.prompt)}
                  className="block w-full text-left rounded-[4px] px-2 py-1.5 text-xs text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)] transition"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Knowledge source pills — below input, Harvey-style */}
      {!hasResultOrTrace && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {KNOWLEDGE_SOURCES.map((s) => {
            const Icon = s.icon;
            return (
              <span
                key={s.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule)] bg-[var(--canvas)] px-3 py-1.5 text-xs text-[var(--ink-muted)]"
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
        <LiveTrace state={streamState} />
      )}

      {/* Result */}
      {showResult && !streamState.streaming && (
        <div className="mt-6 rounded-[8px] border border-[var(--rule)] bg-[var(--canvas)] p-5">
          <div className="text-xs text-[var(--ink-subtle)] mb-2">Dante</div>
          <CitationRenderer
            content={streamState.finalContent || "(no response)"}
            trace={streamState.trace}
          />

          {Array.isArray(streamState.trace) && streamState.trace.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--rule)]">
              <button
                onClick={() => setTraceOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-subtle)] hover:text-[var(--ink-muted)]"
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
                        <span className="font-mono text-[var(--ink-muted)]">
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

      {/* History — collapsible at bottom of the surface */}
      {!hasResultOrTrace && (
        <div className="mt-12">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-[var(--ink-subtle)] hover:text-[var(--ink-muted)]"
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
                      className="w-full text-left rounded-[4px] px-3 py-2 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition truncate"
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

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  tip,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  tip?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tip}
      className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-xs transition disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-[var(--canvas)] text-[var(--ink)]"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas)]/60"
      }`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );
}

// ── Live trace ──────────────────────────────────────────────────

function LiveTrace({ state }: { state: StreamState }) {
  return (
    <div className="mt-6 rounded-[8px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mb-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Working…
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
      <div className="text-xs text-[var(--ink-subtle)] flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-[var(--ink-subtle)]" />
        Thinking about next step…
      </div>
    );
  }
  if (event.type === "tool_start") {
    return (
      <div className="text-xs text-[var(--ink-muted)] flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="font-mono">{prettifyToolName(event.tool_name)}</span>
        {event.summary && (
          <span className="text-[var(--ink-subtle)]">— {event.summary}</span>
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
      <span className="font-mono text-[var(--ink-muted)]">
        {prettifyToolName(event.tool_name)}
      </span>
      {event.summary && (
        <span className="text-[var(--ink-subtle)]">— {event.summary}</span>
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
