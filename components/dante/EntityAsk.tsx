"use client";

// EntityAsk — the "hover any meaningful thing in the app and a tiny
// D/V handle slides in" pattern. Wraps a child element (typically an
// entity name or label); on hover, a faint Sparkles icon appears
// next to it; clicking opens an inline popover with a chat input
// scoped to that entity.
//
// Usage:
//
//   <EntityAsk kind="contact" id={contact.id} label={contact.name}>
//     {contact.name}
//   </EntityAsk>
//
//   <EntityAsk kind="property" id={property.id} label={property.address}>
//     <Link href={`/properties/${property.id}`}>{property.address}</Link>
//   </EntityAsk>
//
// The child renders normally — text, link, whatever. The hover
// affordance is purely additive. Click the icon to ask; everything
// else (clicking the child link, selecting text) is unaffected.
//
// The popover streams through /api/dante/ask with the entity id
// stamped as load-bearing context, same path the contextual panel
// and ⌘/ Ask mode use. Citations work via MarkdownRenderer's
// existing CitationRenderer integration.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  consumeAgentStream,
  initialStreamState,
  type StreamState,
} from "@/app/dante/streamClient";
import MarkdownRenderer from "@/app/dante/MarkdownRenderer";
import { useAssistantBrand } from "./AssistantNameProvider";

export type EntityAskKind =
  | "contact"
  | "property"
  | "reminder"
  | "document"
  | "compliance_flag"
  | "draft";

interface Props {
  kind: EntityAskKind;
  id: string;
  label: string;
  children: React.ReactNode;
  /** Optional starter prompt overrides — defaults are picked per kind. */
  starterPrompts?: string[];
}

const DEFAULT_PROMPTS: Record<EntityAskKind, string[]> = {
  contact: [
    "What's the latest with this client?",
    "Prep me for our next call.",
    "Draft a follow-up email.",
  ],
  property: [
    "Summarize what we know about this property.",
    "Anything renewing soon?",
    "Draft a recap for the linked client.",
  ],
  reminder: [
    "Why was this drafted?",
    "Is this safe to send as-is?",
  ],
  document: [
    "Summarize this document.",
    "When does it expire and what should I do next?",
  ],
  compliance_flag: [
    "What rule fired and why?",
    "How should I resolve this?",
  ],
  draft: [
    "Why was this drafted?",
    "Polish it before I send.",
  ],
};

// Build the message payload sent to /api/dante/ask. The agent uses
// the entity-id-stamped context fields where applicable; for kinds
// the API doesn't natively scope on (reminder, document, flag, draft)
// we prepend a short preamble so the agent treats the lookup as
// load-bearing.
function buildAskBody(
  kind: EntityAskKind,
  id: string,
  label: string,
  message: string,
): Parameters<typeof consumeAgentStream>[0]["body"] {
  if (kind === "contact") {
    return {
      message,
      context_contact_id: id,
      context_contact_name: label,
    };
  }
  if (kind === "property") {
    return {
      message,
      context_property_id: id,
      context_property_label: label,
    };
  }
  // For other kinds, prepend a context line so the agent knows the
  // exact entity being asked about even though the API route doesn't
  // pre-fetch their facts.
  const preamble =
    kind === "reminder"
      ? `CONTEXT: this question is about reminder "${label}" (id: ${id}). When checking memory or vault, scope to the related contact / property if any.`
      : kind === "document"
      ? `CONTEXT: this question is about document "${label}" (id: ${id}). Look up the document via vault.cite if helpful.`
      : kind === "compliance_flag"
      ? `CONTEXT: this question is about compliance flag id ${id} ("${label}"). Pull the flag's details and explain plainly.`
      : `CONTEXT: this question is about draft "${label}" (id: ${id}).`;
  return { message: `${preamble}\n\n${message}` };
}

export default function EntityAsk({
  kind,
  id,
  label,
  children,
  starterPrompts,
}: Props) {
  const { name: assistantName } = useAssistantBrand();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Chat state — local to this popover instance.
  const [prompt, setPrompt] = useState("");
  const [stream, setStream] = useState<StreamState>(initialStreamState());
  const [hasAsked, setHasAsked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const openPopover = useCallback(() => {
    if (iconRef.current) {
      const r = iconRef.current.getBoundingClientRect();
      // Anchor below + slightly indented from the icon. Clamp to
      // viewport so the popover never lands off the right edge.
      const popoverWidth = 340;
      const left = Math.min(
        r.left,
        window.innerWidth - popoverWidth - 16,
      );
      setAnchor({ left, top: r.bottom + 6 });
    }
    setOpen(true);
    setHasAsked(false);
    setStream(initialStreamState());
    setPrompt("");
    // Focus the input on next tick so the popover is mounted.
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const close = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setOpen(false);
  }, []);

  // Click-outside + Esc → close. Popover stays where it was opened
  // even on scroll (user can dismiss + re-open if it goes off-screen).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (iconRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || stream.streaming) return;
      setPrompt("");
      setHasAsked(true);
      setStream({ ...initialStreamState(), streaming: true });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await consumeAgentStream({
          body: buildAskBody(kind, id, label, q),
          signal: controller.signal,
          onUpdate: (s) => setStream(s),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "request failed";
        setStream((s) => ({ ...s, streaming: false, error: msg }));
      }
    },
    [stream.streaming, kind, id, label],
  );

  const prompts = starterPrompts || DEFAULT_PROMPTS[kind];
  const showThinking = stream.streaming && !stream.finalContent;

  return (
    <span className="entity-ask group relative inline-flex items-center gap-0.5 align-baseline">
      {children}
      <button
        ref={iconRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) close();
          else openPopover();
        }}
        aria-label={`Ask ${assistantName} about ${label}`}
        title={`Ask ${assistantName} about this ${kind}`}
        className="entity-ask__icon inline-flex items-center justify-center w-3.5 h-3.5 ml-0.5 rounded-[3px] text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] opacity-0 group-hover:opacity-100 transition"
        style={{ verticalAlign: "middle" }}
      >
        <Sparkles className="w-2.5 h-2.5" strokeWidth={1.75} />
      </button>

      {open && anchor && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              className="fixed z-[70] w-[340px] rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] shadow-2xl overflow-hidden"
              style={{ left: anchor.left, top: anchor.top }}
              role="dialog"
              aria-label={`Ask ${assistantName}`}
            >
              <div className="px-3 py-2 border-b border-[var(--rule)] bg-[var(--canvas-subtle)] flex items-center gap-2">
                <Sparkles
                  className="w-3 h-3 text-[var(--ink-muted)]"
                  strokeWidth={1.5}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                    {assistantName} · {kind}
                  </div>
                  <div className="text-xs font-medium text-[var(--ink)] truncate">
                    {label}
                  </div>
                </div>
                <button
                  onClick={close}
                  className="p-0.5 rounded text-[var(--ink-muted)] hover:bg-[var(--canvas)] transition"
                  title="Close"
                >
                  <X className="w-3 h-3" strokeWidth={1.5} />
                </button>
              </div>

              {/* Body — starter chips before first ask, transcript after. */}
              <div className="px-3 py-3 max-h-[280px] overflow-y-auto">
                {!hasAsked && (
                  <div className="space-y-1.5">
                    {prompts.map((p) => (
                      <button
                        key={p}
                        onClick={() => ask(p)}
                        className="w-full text-left text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] px-2 py-1.5 rounded-[4px] hover:bg-[var(--canvas-subtle)] transition"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}

                {hasAsked && stream.streaming && (
                  <div>
                    {showThinking ? (
                      <div className="inline-flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
                        <Loader2
                          className="w-3 h-3 animate-spin"
                          strokeWidth={1.5}
                        />
                        {stream.events.length > 0
                          ? streamingStatus(stream)
                          : "Thinking…"}
                      </div>
                    ) : (
                      <div className="text-[13px] text-[var(--ink)] leading-relaxed">
                        <MarkdownRenderer
                          content={stream.finalContent}
                          trace={stream.trace}
                        />
                      </div>
                    )}
                  </div>
                )}

                {hasAsked && !stream.streaming && stream.finalContent && (
                  <div className="text-[13px] text-[var(--ink)] leading-relaxed">
                    <MarkdownRenderer
                      content={stream.finalContent}
                      trace={stream.trace}
                    />
                  </div>
                )}

                {stream.error && (
                  <div className="text-[11px] text-[var(--danger)]">
                    {stream.error}
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-[var(--rule)] px-3 py-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(prompt);
                  }}
                  className="flex items-end gap-2"
                >
                  <textarea
                    ref={inputRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        ask(prompt);
                      }
                    }}
                    rows={1}
                    placeholder={`Ask about this ${kind}…`}
                    className="flex-1 resize-none bg-transparent text-xs text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none max-h-24 py-1"
                  />
                  <button
                    type="submit"
                    disabled={!prompt.trim() || stream.streaming}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 transition"
                    title="Send"
                  >
                    {stream.streaming ? (
                      <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Send className="w-3 h-3" strokeWidth={1.5} />
                    )}
                  </button>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function streamingStatus(stream: StreamState): string {
  if (stream.events.length === 0) return "Thinking…";
  const last = stream.events[stream.events.length - 1];
  if (last.type === "tool_start") return `Calling ${last.tool_name}…`;
  if (last.type === "tool_end") return `${last.tool_name} → ${last.status}`;
  if (last.type === "iteration_thinking")
    return last.summary || `Thinking (step ${last.iteration})…`;
  return "Thinking…";
}
