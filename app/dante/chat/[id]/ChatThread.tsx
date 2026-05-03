"use client";

// app/dante/chat/[id]/ChatThread.tsx
//
// Renders the message history for a single chat with a pinned
// follow-up input. Same Harvey-style visual primitives as /dante —
// no chat bubbles, clean prose, action bar under each assistant
// turn, aggregated Sources block.
//
// Streams new turns via /api/dante/ask SSE so each follow-up
// renders the live "Working…" trace before settling into the final
// answer.

import { useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { deriveFilenameStem } from "@/app/dante/DocumentPanel";
import DraftEditor from "@/components/dante/DraftEditor";
import {
  consumeAgentStream,
  initialStreamState,
  type StreamState,
} from "@/app/dante/streamClient";
import {
  UserMessage,
  AssistantMessage,
  LiveThinking,
} from "@/app/dante/MessageView";

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  trace: unknown;
  /** Suggested follow-ups carried from the live stream. Persisted
   *  messages don't have these (we only persist content + trace
   *  today), so older turns render with no follow-ups. */
  followups?: string[];
  /** Citation validator output. Phase 3+ panel fix #2: this is now
   *  persisted on dante_chat_messages.citation_report and read on
   *  page load via app/dante/chat/[id]/page.tsx. The page passes
   *  the snake_case column through; we bridge to camelCase here. */
  citation_report?: unknown;
  citationReport?: import("@/app/dante/streamClient").CitationReportState | null;
  grounding?: import("@/app/dante/streamClient").GroundingState | null;
  grounding_score?: number | null;
  prompt_version?: string | null;
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
  const [editorContent, setEditorContent] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamState.streaming, streamState.events.length, streamState.followups.length]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = async (overrideInput?: string) => {
    const message = (overrideInput ?? input).trim();
    if (!message || streamState.streaming) return;

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

      const assistant: Message = {
        id: captured.messageId || `assistant_${Date.now()}`,
        role: "assistant",
        content: captured.finalContent || "(no response)",
        trace: captured.trace,
        followups: captured.followups || [],
        citationReport: captured.citationReport ?? null,
        grounding: captured.grounding ?? null,
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
        followups: [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setStreamState(initialStreamState());
    }
  };

  const onRewriteLast = async (instruction: string) => {
    // Rewrites the latest assistant turn's content. Same shape as the
    // landing surface — refine endpoint preserves citation markers.
    const lastIdx = [...messages].reverse().findIndex((m) => m.role === "assistant");
    if (lastIdx < 0 || refining) return;
    const realIdx = messages.length - 1 - lastIdx;
    const target = messages[realIdx];
    setRefining(true);
    try {
      const res = await fetch("/api/dante/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "answer", text: target.content, instruction }),
      });
      const json = await res.json();
      if (res.ok && json.text) {
        setMessages((prev) => {
          const next = [...prev];
          next[realIdx] = { ...target, content: json.text };
          return next;
        });
      }
    } catch {
      /* swallow */
    } finally {
      setRefining(false);
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
      <div className="space-y-8 mb-32">
        {messages.map((m) =>
          m.role === "user" ? (
            <UserMessage key={m.id} content={m.content} />
          ) : (
            <AssistantMessage
              key={m.id}
              content={m.content}
              trace={m.trace}
              followups={m.followups || []}
              citationReport={
                // Bridge persisted snake_case → in-memory camelCase
                // shape so chips decorate identically on reload.
                (m.citationReport as import("@/app/dante/streamClient").CitationReportState | null | undefined) ??
                (m.citation_report as import("@/app/dante/streamClient").CitationReportState | null | undefined) ??
                null
              }
              grounding={
                // For persisted messages we only have grounding_score (numeric);
                // synthesize a minimal GroundingState so the badge still renders
                // on reload. Full breakdown only available for live turns.
                m.grounding ??
                (typeof m.grounding_score === "number"
                  ? {
                      score: m.grounding_score,
                      tier:
                        m.grounding_score >= 0.7
                          ? "strong"
                          : m.grounding_score >= 0.4
                            ? "partial"
                            : "general",
                      summary: "Persisted grounding score from when this turn was generated.",
                    }
                  : null)
              }
              onOpenEditor={(c) => setEditorContent(c)}
              onRewrite={(instruction) => onRewriteLast(instruction)}
              onFollowup={(q) => submit(q)}
              rewriting={refining}
            />
          ),
        )}

        {streamState.streaming && (
          <LiveThinking state={streamState} deep={false} />
        )}

        <div ref={bottomRef} />
      </div>

      {editorContent != null && (
        <DraftEditor
          initialContent={editorContent}
          filenameStem={deriveFilenameStem(editorContent)}
          onClose={() => setEditorContent(null)}
        />
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--canvas)] via-[var(--canvas)] to-transparent pt-6 pb-4 z-30">
        <div className="max-w-[900px] mx-auto px-6 md:px-8">
          <div className="relative rounded-[12px] border border-[var(--rule)] bg-[var(--canvas-subtle)] shadow-sm">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Follow up… Cmd+Enter to send."
              disabled={streamState.streaming}
              rows={2}
              className="w-full resize-none bg-transparent pl-5 pr-14 py-4 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none disabled:opacity-60"
            />
            <button
              onClick={() => submit()}
              disabled={!input.trim() || streamState.streaming}
              className="absolute bottom-2.5 right-2.5 inline-flex items-center justify-center w-8 h-8 rounded-[6px] bg-black text-white hover:bg-black/85 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Send (Cmd+Enter)"
            >
              {streamState.streaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
