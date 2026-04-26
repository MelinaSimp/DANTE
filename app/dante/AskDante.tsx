"use client";

// app/dante/AskDante.tsx
//
// Harvey-style "Ask Dante anything" client component, now with live
// streaming. Submitting a question opens an SSE connection to
// /api/dante/ask and renders each tool call as it happens — the
// "Searching memory…" / "Checking vault…" steps appear live, then
// the final assistant message replaces them. Closing the gap from
// "I asked, then waited 10s in silence" → "I asked, watched it work."
//
// Citations in the output render as clickable chips via the shared
// CitationRenderer. The popover pulls source content out of the
// same trace, so no extra fetch.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Loader2,
  Sparkles,
  Clock,
  ChevronRight,
  ChevronDown,
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

export default function AskDante() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState());
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/chats");
      const json = await res.json();
      setRecent((json.chats || []) as RecentChat[]);
    } catch {
      // non-fatal
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
    textareaRef.current?.focus();
  };

  const showResult = !!streamState.finalContent || streamState.events.length > 0;

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-8">
      <div className="min-w-0">
        <div className="rounded-[8px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Dante anything. Cmd+Enter to send."
            disabled={streamState.streaming}
            rows={4}
            className="w-full resize-none bg-transparent px-4 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--rule)]">
            <div className="flex items-center gap-2 text-xs text-[var(--ink-subtle)]">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
              Read-only by default — uses memory, vault, and contacts.
            </div>
            <button
              onClick={submit}
              disabled={!input.trim() || streamState.streaming}
              className="inline-flex items-center gap-1.5 rounded-[4px] bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-40"
            >
              {streamState.streaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {streamState.streaming ? "Thinking…" : "Send"}
            </button>
          </div>
        </div>

        {/* Quick prompts */}
        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              onClick={() => usePrompt(q.prompt)}
              disabled={streamState.streaming}
              className="text-xs rounded-full border border-[var(--rule)] bg-[var(--canvas)] px-3 py-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--ink-subtle)] transition disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Live trace — only while streaming and before final lands */}
        {streamState.streaming && streamState.events.length > 0 && (
          <LiveTrace state={streamState} />
        )}

        {/* Result */}
        {showResult && !streamState.streaming && (
          <div className="mt-6 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] p-5">
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
                  {streamState.trace.length} reasoning step
                  {streamState.trace.length === 1 ? "" : "s"}
                </button>
                {traceOpen && (
                  <div className="mt-3 space-y-2">
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
                  onClick={() =>
                    router.push(`/dante/chat/${streamState.chatId}`)
                  }
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
      </div>

      <aside className="lg:border-l lg:border-[var(--rule)] lg:pl-6">
        <div className="flex items-center gap-1.5 text-xs text-[var(--ink-subtle)] mb-3">
          <Clock className="w-3 h-3" />
          Recent
        </div>
        {recent.length === 0 ? (
          <div className="text-xs text-[var(--ink-subtle)]">No chats yet.</div>
        ) : (
          <div className="space-y-1">
            {recent.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/dante/chat/${c.id}`)}
                className="w-full text-left rounded-[4px] px-2 py-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition truncate"
                title={c.title}
              >
                {c.title}
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Live trace component ─────────────────────────────────────────
// Renders the in-flight tool calls as a checklist that ticks off
// as each tool_end event arrives. Replaced by the final result panel
// once the stream completes.

function LiveTrace({ state }: { state: StreamState }) {
  return (
    <div className="mt-6 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-4">
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
        {event.summary && <span className="text-[var(--ink-subtle)]">— {event.summary}</span>}
      </div>
    );
  }
  // tool_end
  const ok = event.status === "success";
  return (
    <div className="text-xs flex items-center gap-2">
      <span
        className={ok ? "text-emerald-300/80" : "text-red-300"}
        aria-hidden
      >
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
  // memory_search → "memory.search"
  // vault_cite → "vault.cite"
  // mcp__wealthbox__contacts_search → "wealthbox · contacts.search"
  if (raw.startsWith("mcp__")) {
    const parts = raw.slice(5).split("__");
    return `${parts[0]} · ${(parts[1] || "").replace(/_/g, ".")}`;
  }
  return raw.replace(/_/g, ".");
}
