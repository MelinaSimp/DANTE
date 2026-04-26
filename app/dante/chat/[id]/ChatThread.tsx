"use client";

// app/dante/chat/[id]/ChatThread.tsx
//
// Renders the message history for a single chat with a pinned
// follow-up input. Streams new turns via /api/dante/ask SSE so each
// follow-up renders the live "Working…" trace, then settles into
// the final answer with clickable citation chips.

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  ChevronRight,
  ChevronDown,
  User as UserIcon,
  Sparkles,
} from "lucide-react";
import CitationRenderer from "@/app/dante/CitationRenderer";
import {
  consumeAgentStream,
  initialStreamState,
  type StreamState,
} from "@/app/dante/streamClient";
import type { StepLogEntry } from "@/lib/dante/workflow-types";

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
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamState.streaming, streamState.events.length]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = async () => {
    const message = input.trim();
    if (!message || streamState.streaming) return;

    // Optimistic user-message insert.
    const optimisticUser: Message = {
      id: `optimistic_${Date.now()}`,
      role: "user",
      content: message,
      trace: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");

    abortRef.current = new AbortController();
    setStreamState({ ...initialStreamState(), streaming: true });

    try {
      let captured: StreamState = initialStreamState();
      await consumeAgentStream({
        body: { chat_id: chatId, message },
        signal: abortRef.current.signal,
        onUpdate: (next) => {
          captured = next;
          setStreamState(next);
        },
      });

      // Stream finished — flush the assistant turn into the message
      // list so it renders alongside history. Reset the live state.
      const assistant: Message = {
        id: captured.messageId || `assistant_${Date.now()}`,
        role: "assistant",
        content: captured.finalContent || "(no response)",
        trace: captured.trace,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistant]);
      setStreamState(initialStreamState());
    } catch (err) {
      const errorMsg: Message = {
        id: `err_${Date.now()}`,
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "request_failed"}`,
        trace: [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setStreamState(initialStreamState());
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

        {streamState.streaming && streamState.events.length > 0 && (
          <LiveTrace state={streamState} />
        )}

        {streamState.streaming && streamState.events.length === 0 && (
          <div className="flex items-start gap-3 text-[var(--ink-subtle)]">
            <Sparkles className="w-4 h-4 mt-1" strokeWidth={1.5} />
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--canvas)] via-[var(--canvas)] to-transparent pt-6 pb-4">
        <div className="max-w-[900px] mx-auto px-6 md:px-8">
          <div className="rounded-[8px] border border-[var(--rule)] bg-[var(--canvas-subtle)]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Follow up… Cmd+Enter to send."
              disabled={streamState.streaming}
              rows={2}
              className="w-full resize-none bg-transparent px-4 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none disabled:opacity-60"
            />
            <div className="flex items-center justify-end px-3 py-2 border-t border-[var(--rule)]">
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
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const [traceOpen, setTraceOpen] = useState(false);
  const trace = Array.isArray(message.trace) ? (message.trace as StepLogEntry[]) : [];

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
        <CitationRenderer content={message.content} trace={trace} />
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

function LiveTrace({ state }: { state: StreamState }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/40 p-1.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
      </div>
      <div className="flex-1 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-3">
        <div className="text-[11px] text-[var(--ink-subtle)] mb-2">Working…</div>
        <div className="space-y-1.5">
          {state.events.map((e, i) => {
            if (e.type === "iteration_thinking") {
              return (
                <div
                  key={i}
                  className="text-[11px] text-[var(--ink-subtle)] flex items-center gap-2"
                >
                  <span className="w-1 h-1 rounded-full bg-[var(--ink-subtle)]" />
                  Thinking about next step…
                </div>
              );
            }
            const tool = prettifyToolName(e.tool_name);
            if (e.type === "tool_start") {
              return (
                <div
                  key={i}
                  className="text-[11px] text-[var(--ink-muted)] flex items-center gap-2"
                >
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span className="font-mono">{tool}</span>
                  {e.summary && (
                    <span className="text-[var(--ink-subtle)]">— {e.summary}</span>
                  )}
                </div>
              );
            }
            const ok = e.status === "success";
            return (
              <div key={i} className="text-[11px] flex items-center gap-2">
                <span
                  className={ok ? "text-emerald-300/80" : "text-red-300"}
                  aria-hidden
                >
                  {ok ? "✓" : "✗"}
                </span>
                <span className="font-mono text-[var(--ink-muted)]">{tool}</span>
                {e.summary && (
                  <span className="text-[var(--ink-subtle)]">— {e.summary}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
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
