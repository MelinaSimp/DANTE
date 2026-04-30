"use client";

// ContextualAskPanel — drop-in surface for asking D/V about a
// specific entity (property, contact, document) from any detail
// page. Renders a small "Ask <Name>" trigger; clicking opens a
// floating panel with a chat surface bound to the entity's id.
//
// Reuses the existing /api/dante/ask SSE endpoint — same engine,
// same memory, same vault citations — just with context_property_id
// or context_contact_id stamped onto the request so the agent
// defaults its tool calls to the page the user's actually on.
//
// Usage:
//
//   <ContextualAskPanel
//     entityKind="property"
//     entityId={property.id}
//     entityLabel={property.address_line1}
//   />
//
// The panel is intentionally local-state-only — refreshing the page
// returns to the trigger, and the conversation persists as a
// dante_chats row so the user can re-open it from /dante later.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Send,
  Sparkles,
  X,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import {
  consumeAgentStream,
  initialStreamState,
  type StreamState,
} from "@/app/dante/streamClient";
import { useAssistantBrand } from "./AssistantNameProvider";
import MarkdownRenderer from "@/app/dante/MarkdownRenderer";
import AgentPlan from "./AgentPlan";
import type { StepLogEntry } from "@/lib/dante/workflow-types";

export type EntityKind = "property" | "contact";

interface Props {
  entityKind: EntityKind;
  entityId: string;
  entityLabel: string;
  /** Optional starter prompts shown as chips above the input. If
   *  omitted, sensible defaults render based on entityKind. */
  starterPrompts?: string[];
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Trace from the agent run — the citation map is derived from this
   *  so [v1] / [mem:abc12345] markers in `content` render as clickable
   *  chips. Empty for user turns. */
  trace: StepLogEntry[];
}

const DEFAULT_PROMPTS: Record<EntityKind, string[]> = {
  property: [
    "Draft a recap email for the linked client.",
    "What needs renewal soonest?",
    "Summarize what we know about this property.",
  ],
  contact: [
    "Summarize the last 14 days of correspondence.",
    "Prep me for our next meeting.",
    "What did I last promise this client?",
  ],
};

export default function ContextualAskPanel({
  entityKind,
  entityId,
  entityLabel,
  starterPrompts,
}: Props) {
  const { name: assistantName } = useAssistantBrand();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [stream, setStream] = useState<StreamState>(initialStreamState());
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Esc closes the panel. Mirrors the rest of the app's modal idiom.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Auto-scroll the transcript as new content streams in.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [stream.events.length, stream.finalContent, turns.length]);

  // Cancel any in-flight stream when the panel closes — prevents
  // late events from landing in the wrong panel state on reopen.
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [open]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || stream.streaming) return;
      setInput("");
      setTurns((t) => [...t, { role: "user", content: q, trace: [] }]);
      setStream({ ...initialStreamState(), streaming: true });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await consumeAgentStream({
          body: {
            message: q,
            chat_id: chatId,
            context_property_id: entityKind === "property" ? entityId : undefined,
            context_property_label: entityKind === "property" ? entityLabel : undefined,
            context_contact_id: entityKind === "contact" ? entityId : undefined,
            context_contact_name: entityKind === "contact" ? entityLabel : undefined,
          },
          signal: controller.signal,
          onUpdate: (s) => {
            setStream(s);
            if (s.chatId && s.chatId !== chatId) setChatId(s.chatId);
          },
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "request failed";
        setStream((s) => ({ ...s, streaming: false, error: msg }));
      }

      // After the stream resolves, fold the final assistant content
      // into the turn history along with its trace so citation chips
      // remain clickable when the user scrolls back. Reset the live
      // stream state for the next question.
      setStream((s) => {
        if (s.finalContent) {
          setTurns((t) => [
            ...t,
            { role: "assistant", content: s.finalContent, trace: s.trace },
          ]);
        }
        return initialStreamState();
      });
    },
    [stream.streaming, chatId, entityKind, entityId, entityLabel],
  );

  const prompts = starterPrompts || DEFAULT_PROMPTS[entityKind];
  const liveAssistantContent = stream.finalContent;
  const showThinking = stream.streaming && !liveAssistantContent;

  // Trigger button — small inline element pages drop next to the
  // entity heading. Pressed state opens the floating panel.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
        title={`Ask ${assistantName} about this ${entityKind}`}
      >
        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
        Ask {assistantName}
      </button>
    );
  }

  return (
    <>
      {/* Trigger stays visible underneath so the button doesn't
          appear to disappear; it just goes into pressed state. */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium"
      >
        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
        Ask {assistantName}
      </button>

      <div
        className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-[var(--ink)]/30 backdrop-blur-sm sm:px-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="bg-[var(--canvas)] border border-[var(--rule)] sm:rounded-[8px] shadow-2xl w-full sm:max-w-2xl flex flex-col h-[85vh] sm:h-[78vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--rule)]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                <span>{assistantName}</span>
                <ChevronRight className="w-2.5 h-2.5" strokeWidth={1.5} />
                <span>{entityKind}</span>
              </div>
              <div className="text-sm font-medium text-[var(--ink)] truncate mt-0.5">
                {entityLabel}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {chatId && (
                <Link
                  href={`/dante/chat/${chatId}`}
                  className="p-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                  title={`Open in ${assistantName}`}
                >
                  <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                </Link>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                title="Close"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Transcript */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-5"
          >
            {turns.length === 0 && !stream.streaming && !liveAssistantContent && (
              <div className="text-xs text-[var(--ink-muted)] space-y-3">
                <p>
                  Ask anything about this {entityKind}. {assistantName} has the
                  facts on file already — linked clients, attached documents,
                  recent correspondence — so you don't need to repeat context.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {prompts.map((p) => (
                    <button
                      key={p}
                      onClick={() => ask(p)}
                      className="px-2.5 py-1 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[11px] text-[var(--ink)] text-left transition"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i}>
                {t.role === "user" ? (
                  <div className="text-xs mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1.5">
                    You
                  </div>
                ) : (
                  <div className="text-xs mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1.5">
                    {assistantName}
                  </div>
                )}
                <div className="text-sm text-[var(--ink)] leading-relaxed">
                  {t.role === "assistant" ? (
                    <MarkdownRenderer content={t.content} trace={t.trace} />
                  ) : (
                    <span className="whitespace-pre-wrap">{t.content}</span>
                  )}
                </div>
                {t.role === "assistant" && <AgentPlan trace={t.trace} />}
              </div>
            ))}

            {stream.streaming && (
              <div>
                <div className="text-xs mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1.5">
                  {assistantName}
                </div>
                {showThinking ? (
                  <div className="inline-flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                    {stream.events.length > 0 ? (
                      <span>
                        {(() => {
                          const last = stream.events[stream.events.length - 1];
                          if (last.type === "tool_start")
                            return `Calling ${last.tool_name}…`;
                          if (last.type === "tool_end")
                            return `${last.tool_name} → ${last.status}`;
                          if (last.type === "iteration_thinking")
                            return last.summary || `Thinking (step ${last.iteration})…`;
                          return "Thinking…";
                        })()}
                      </span>
                    ) : (
                      <span>Thinking…</span>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-[var(--ink)] leading-relaxed">
                      <MarkdownRenderer content={liveAssistantContent} trace={stream.trace} />
                    </div>
                    {!stream.streaming && <AgentPlan trace={stream.trace} />}
                  </>
                )}
              </div>
            )}

            {stream.error && (
              <div className="text-xs text-[var(--danger)]">
                {stream.error}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-[var(--rule)] px-5 py-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                rows={1}
                placeholder={`Ask ${assistantName} about this ${entityKind}…`}
                className="flex-1 resize-none bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none max-h-32 py-2"
              />
              <button
                type="submit"
                disabled={!input.trim() || stream.streaming}
                className="inline-flex items-center justify-center w-8 h-8 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 transition"
                title="Send"
              >
                {stream.streaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
              </button>
            </form>
            <div className="text-[10px] mono text-[var(--ink-subtle)] mt-1">
              ⌘+enter open in {assistantName} · esc to close
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
