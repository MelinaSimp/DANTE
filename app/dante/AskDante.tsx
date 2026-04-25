"use client";

// app/dante/AskDante.tsx
//
// Harvey-style "Ask Dante anything" client component. Sits on top of
// the /dante landing page as the primary surface — the four legacy
// cards (Churn, Workflows, Archive, Templates) move to a smaller
// "Surfaces" row underneath.
//
// MVP behavior:
//   - Single textarea, big and obvious. Submit on Cmd/Ctrl+Enter.
//   - Quick-prompt pills below the input prefill the textarea with
//     templated prompts that map to common skill calls. Advisor can
//     edit before sending.
//   - On submit, POSTs /api/dante/ask. While waiting, the input
//     locks and a thinking indicator shows. Result renders inline
//     with the assistant message + collapsible reasoning trace.
//   - Recent chats list to the right. Clicking one navigates to
//     /dante/chat/[id] which renders the full thread.
//
// Deliberately out of scope for MVP:
//   - Streaming — we wait for the full response. The agent loop is
//     bounded at max_steps=10, so worst case is a few seconds.
//   - @-mention source picker. Add later when the volume of
//     "narrow this to one contact" requests justifies the UX work.
//   - File upload. Same logic — defer.

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

interface RecentChat {
  id: string;
  title: string;
  updated_at: string;
}

interface TraceEntry {
  step_id: string;
  step_type: string;
  step_name: string;
  status: string;
  output?: unknown;
  error?: string;
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
  const [submitting, setSubmitting] = useState(false);
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [result, setResult] = useState<{
    chat_id: string;
    content: string;
    trace: TraceEntry[];
    error?: string;
  } | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
  }, [refreshRecent]);

  // Cmd/Ctrl+Enter to submit. Plain Enter inserts a newline because
  // questions to a chat agent are routinely multi-line.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const submit = async () => {
    const message = input.trim();
    if (!message || submitting) return;
    setSubmitting(true);
    setResult(null);
    setTraceOpen(false);
    try {
      const res = await fetch("/api/dante/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      setResult({
        chat_id: json.chat_id,
        content: json.content || "(no response)",
        trace: (json.trace || []) as TraceEntry[],
        error: json.error,
      });
      setInput("");
      refreshRecent();
    } catch (err) {
      setResult({
        chat_id: "",
        content: `Error: ${err instanceof Error ? err.message : "request_failed"}`,
        trace: [],
        error: "request_failed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const usePrompt = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-8">
      {/* ── Main column ────────────────────────────────────────── */}
      <div className="min-w-0">
        {/* Input */}
        <div className="rounded-[8px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Dante anything. Cmd+Enter to send."
            disabled={submitting}
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
              disabled={!input.trim() || submitting}
              className="inline-flex items-center gap-1.5 rounded-[4px] bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? "Thinking…" : "Send"}
            </button>
          </div>
        </div>

        {/* Quick prompts */}
        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              onClick={() => usePrompt(q.prompt)}
              disabled={submitting}
              className="text-xs rounded-full border border-[var(--rule)] bg-[var(--canvas)] px-3 py-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--ink-subtle)] transition disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Result */}
        {result && (
          <div className="mt-6 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] p-5">
            <div className="text-xs text-[var(--ink-subtle)] mb-2">Dante</div>
            <div className="prose prose-invert prose-sm max-w-none text-[var(--ink)] whitespace-pre-wrap">
              {result.content}
            </div>

            {result.trace.length > 0 && (
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
                  {result.trace.length} reasoning step{result.trace.length === 1 ? "" : "s"}
                </button>
                {traceOpen && (
                  <div className="mt-3 space-y-2">
                    {result.trace.map((t) => (
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

            {result.chat_id && (
              <div className="mt-4 pt-4 border-t border-[var(--rule)] text-xs">
                <button
                  onClick={() => router.push(`/dante/chat/${result.chat_id}`)}
                  className="text-[var(--ink-muted)] hover:text-[var(--ink)] underline"
                >
                  Continue this conversation →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Recent chats sidebar ───────────────────────────────── */}
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
