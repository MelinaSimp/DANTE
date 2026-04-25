"use client";

// app/dante/chat/[id]/ChatThread.tsx
//
// Renders the message history for a single chat and provides a
// follow-up input pinned to the bottom. Each assistant message has
// an expandable reasoning trace (the StepLogEntry[] from the agent
// loop) so the advisor can audit "why did Dante say that?"

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  ChevronRight,
  ChevronDown,
  User as UserIcon,
  Sparkles,
} from "lucide-react";

interface TraceEntry {
  step_id: string;
  step_type: string;
  step_name: string;
  status: string;
  output?: unknown;
  error?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  trace: unknown;
  created_at: string;
}

export default function ChatThread({
  chatId,
  initialMessages,
}: {
  chatId: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom whenever messages change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, submitting]);

  const submit = async () => {
    const message = input.trim();
    if (!message || submitting) return;
    setSubmitting(true);

    // Optimistic user-message insert so the UI updates immediately
    // rather than waiting on the round-trip.
    const optimisticUser: Message = {
      id: `optimistic_${Date.now()}`,
      role: "user",
      content: message,
      trace: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");

    try {
      const res = await fetch("/api/dante/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message }),
      });
      const json = await res.json();
      const assistant: Message = {
        id: json.message_id || `assistant_${Date.now()}`,
        role: "assistant",
        content: json.content || "(no response)",
        trace: json.trace || [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistant]);
    } catch (err) {
      const errorMsg: Message = {
        id: `err_${Date.now()}`,
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "request_failed"}`,
        trace: [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div>
      <div className="space-y-6 mb-32">
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {submitting && (
          <div className="flex items-start gap-3 text-[var(--ink-subtle)]">
            <Sparkles className="w-4 h-4 mt-1" strokeWidth={1.5} />
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Pinned follow-up input */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--canvas)] via-[var(--canvas)] to-transparent pt-6 pb-4">
        <div className="max-w-[900px] mx-auto px-6 md:px-8">
          <div className="rounded-[8px] border border-[var(--rule)] bg-[var(--canvas-subtle)]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Follow up… Cmd+Enter to send."
              disabled={submitting}
              rows={2}
              className="w-full resize-none bg-transparent px-4 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none disabled:opacity-60"
            />
            <div className="flex items-center justify-end px-3 py-2 border-t border-[var(--rule)]">
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
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const [traceOpen, setTraceOpen] = useState(false);
  const trace = Array.isArray(message.trace) ? (message.trace as TraceEntry[]) : [];

  if (message.role === "user") {
    return (
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-1.5">
          <UserIcon className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
        </div>
        <div className="flex-1 pt-0.5 text-[var(--ink)] whitespace-pre-wrap text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/40 p-1.5">
        <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[var(--ink)] text-sm whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>
        {trace.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setTraceOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-subtle)] hover:text-[var(--ink-muted)]"
            >
              {traceOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {trace.length} reasoning step{trace.length === 1 ? "" : "s"}
            </button>
            {traceOpen && (
              <div className="mt-2 space-y-1.5">
                {trace.map((t) => (
                  <div
                    key={t.step_id}
                    className="text-[11px] rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between">
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
                    {t.error && <div className="text-red-300/90 mt-0.5">{t.error}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
