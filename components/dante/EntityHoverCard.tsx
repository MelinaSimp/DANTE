"use client";

// EntityHoverCard — rich hover preview for contacts and properties.
// Replaces the simple "ASK" pill on those two entity kinds with a
// preview card that shows summary data (last interaction, linked
// counts, stage, expected close) and an embedded "Ask <Name>"
// button that triggers the same chat popover the pill used to.
//
// Hover-with-200ms-delay before showing so brushing across a list
// doesn't fire cards on every name; debounce on leave so quick
// re-entry doesn't flicker. Data is fetched once per (kind, id) and
// memoized in a module-level cache so the same entity never refetches
// on the same page.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Loader2,
  Send,
  Mail,
  Phone,
  Home,
  CalendarClock,
  Users,
  FileText,
  Clock,
  ClipboardCheck,
} from "lucide-react";
import {
  consumeAgentStream,
  initialStreamState,
  type StreamState,
} from "@/app/dante/streamClient";
import MarkdownRenderer from "@/app/dante/MarkdownRenderer";
import { useAssistantBrand } from "./AssistantNameProvider";

type Kind = "contact" | "property";

interface ContactPreview {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  linked_property_count: number;
  last_interaction_at: string | null;
  last_interaction_kind: "note" | "email" | "call" | null;
  review_stage: string | null;
  next_review_date: string | null;
}

interface PropertyPreview {
  id: string;
  address: string;
  status: string;
  kind: string | null;
  transaction_stage: string | null;
  stage_days: number | null;
  expected_close_date: string | null;
  list_price_cents: number | null;
  beds: number | null;
  baths: number | null;
  linked_client_count: number;
  document_count: number;
  document_expiring_count: number;
}

type Preview = ContactPreview | PropertyPreview;

// Module-scoped cache so re-hovering the same entity doesn't refetch.
// Cleared on full page reload — that's the right granularity for
// preview data (it's not real-time, but a session is fresh enough).
const previewCache = new Map<string, Preview>();
const inflight = new Map<string, Promise<Preview | null>>();

async function loadPreview(
  kind: Kind,
  id: string,
): Promise<Preview | null> {
  const key = `${kind}:${id}`;
  if (previewCache.has(key)) return previewCache.get(key)!;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    try {
      const r = await fetch(`/api/preview/${kind}/${id}`, {
        credentials: "include",
      });
      if (!r.ok) return null;
      const data = (await r.json()) as Preview;
      previewCache.set(key, data);
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

interface Props {
  kind: Kind;
  id: string;
  label: string;
  children: React.ReactNode;
}

const HOVER_DELAY_MS = 200;
const LEAVE_DELAY_MS = 120;

export default function EntityHoverCard({ kind, id, label, children }: Props) {
  const { name: assistantName } = useAssistantBrand();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);

  const enterTimer = useRef<NodeJS.Timeout | null>(null);
  const leaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Ask state — once user clicks "Ask <Name>" in the card, we flip
  // to chat mode using the same agent loop the simple ASK pill used.
  const [askMode, setAskMode] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [stream, setStream] = useState<StreamState>(initialStreamState());
  const [hasAsked, setHasAsked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const positionCard = useCallback(() => {
    const r = wrapperRef.current?.getBoundingClientRect();
    if (!r) return;
    const cardWidth = 320;
    const left = Math.min(r.left, window.innerWidth - cardWidth - 16);
    const top = r.bottom + 6;
    setAnchor({ left, top });
  }, []);

  const onEnter = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    enterTimer.current = setTimeout(() => {
      positionCard();
      setOpen(true);
      // Kick off load if we haven't yet.
      if (!previewCache.has(`${kind}:${id}`)) {
        setLoading(true);
        loadPreview(kind, id).then((p) => {
          setPreview(p);
          setLoading(false);
        });
      } else {
        setPreview(previewCache.get(`${kind}:${id}`) || null);
      }
    }, HOVER_DELAY_MS);
  }, [kind, id, positionCard]);

  const scheduleLeave = useCallback(() => {
    if (enterTimer.current) {
      clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    leaveTimer.current = setTimeout(() => {
      setOpen(false);
      // Reset chat state when card closes so re-opens start clean.
      setAskMode(false);
      setPrompt("");
      setStream(initialStreamState());
      setHasAsked(false);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    }, LEAVE_DELAY_MS);
  }, []);

  // Cancel timers on unmount.
  useEffect(
    () => () => {
      if (enterTimer.current) clearTimeout(enterTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (abortRef.current) abortRef.current.abort();
    },
    [],
  );

  // Esc closes whether we're in preview or ask mode.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        scheduleLeave();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, scheduleLeave]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || stream.streaming) return;
      setPrompt("");
      setHasAsked(true);
      setStream({ ...initialStreamState(), streaming: true });
      const controller = new AbortController();
      abortRef.current = controller;

      const body =
        kind === "contact"
          ? {
              message: q,
              context_contact_id: id,
              context_contact_name: label,
            }
          : {
              message: q,
              context_property_id: id,
              context_property_label: label,
            };

      try {
        await consumeAgentStream({
          body,
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

  const enterAskMode = () => {
    setAskMode(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const showThinking = stream.streaming && !stream.finalContent;

  return (
    <span
      ref={wrapperRef}
      className="entity-hover-card relative inline-flex items-baseline align-baseline"
      onMouseEnter={onEnter}
      onMouseLeave={scheduleLeave}
    >
      {children}

      {open && anchor && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={cardRef}
              className="fixed z-[70] w-[320px] rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] shadow-2xl overflow-hidden"
              style={{ left: anchor.left, top: anchor.top }}
              onMouseEnter={() => {
                if (leaveTimer.current) {
                  clearTimeout(leaveTimer.current);
                  leaveTimer.current = null;
                }
              }}
              onMouseLeave={scheduleLeave}
              role="dialog"
            >
              {/* Header */}
              <div className="px-3 py-2 border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                  {kind}
                </div>
                <div className="text-sm font-medium text-[var(--ink)] truncate">
                  {label}
                </div>
              </div>

              {/* Body — preview or ask mode */}
              {askMode ? (
                <AskBody
                  assistantName={assistantName}
                  hasAsked={hasAsked}
                  stream={stream}
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  onAsk={ask}
                  inputRef={inputRef}
                  showThinking={showThinking}
                  kind={kind}
                />
              ) : (
                <>
                  <PreviewBody
                    kind={kind}
                    preview={preview}
                    loading={loading}
                  />
                  {/* Ask <Name> button — flips to chat without
                      closing the card. */}
                  <div className="border-t border-[var(--rule)] px-3 py-2">
                    <button
                      type="button"
                      onClick={enterAskMode}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-semibold hover:opacity-90 transition"
                    >
                      <Send className="w-3 h-3" strokeWidth={1.5} />
                      Ask {assistantName}
                    </button>
                  </div>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function PreviewBody({
  kind,
  preview,
  loading,
}: {
  kind: Kind;
  preview: Preview | null;
  loading: boolean;
}) {
  if (loading || !preview) {
    return (
      <div className="px-3 py-4 flex items-center justify-center text-[var(--ink-subtle)]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
      </div>
    );
  }

  if (kind === "contact") {
    const c = preview as ContactPreview;
    const stale =
      c.last_interaction_at &&
      (Date.now() - new Date(c.last_interaction_at).getTime()) / 86400_000 > 30;
    return (
      <div className="px-3 py-3 space-y-2 text-xs">
        {(c.email || c.phone) && (
          <div className="space-y-1">
            {c.email && (
              <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
                <Mail className="w-3 h-3" strokeWidth={1.5} />
                <span className="truncate">{c.email}</span>
              </div>
            )}
            {c.phone && (
              <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
                <Phone className="w-3 h-3" strokeWidth={1.5} />
                <span>{c.phone}</span>
              </div>
            )}
          </div>
        )}
        <div
          className={`flex items-center gap-1.5 ${
            stale ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"
          }`}
        >
          <Clock className="w-3 h-3" strokeWidth={1.5} />
          <span>
            {c.last_interaction_at
              ? `${c.last_interaction_kind} · ${relativeAgo(c.last_interaction_at)}`
              : "No recorded interaction"}
          </span>
        </div>
        {c.linked_property_count > 0 && (
          <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
            <Home className="w-3 h-3" strokeWidth={1.5} />
            <span>
              {c.linked_property_count} linked propert
              {c.linked_property_count === 1 ? "y" : "ies"}
            </span>
          </div>
        )}
        {c.review_stage && c.review_stage !== "done" && (
          <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
            <ClipboardCheck className="w-3 h-3" strokeWidth={1.5} />
            <span>
              Review:{" "}
              <span className="mono uppercase tracking-wider">
                {c.review_stage.replace(/_/g, " ")}
              </span>
              {c.next_review_date && (
                <span className="text-[var(--ink-subtle)]">
                  {" "}
                  · due {c.next_review_date}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

  const p = preview as PropertyPreview;
  const stuck = p.stage_days != null && p.stage_days >= 21;
  return (
    <div className="px-3 py-3 space-y-2 text-xs">
      <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
        <Home className="w-3 h-3" strokeWidth={1.5} />
        <span className="truncate">{p.address || "(no address)"}</span>
      </div>
      {p.transaction_stage && (
        <div
          className={`flex items-center gap-1.5 ${
            stuck ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"
          }`}
        >
          <Clock className="w-3 h-3" strokeWidth={1.5} />
          <span>
            <span className="mono uppercase tracking-wider">
              {p.transaction_stage}
            </span>
            {p.stage_days != null && (
              <span className="text-[var(--ink-subtle)]">
                {" "}
                · {p.stage_days}d in stage
              </span>
            )}
          </span>
        </div>
      )}
      {p.expected_close_date && (
        <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
          <CalendarClock className="w-3 h-3" strokeWidth={1.5} />
          <span>Close: {p.expected_close_date}</span>
        </div>
      )}
      {p.linked_client_count > 0 && (
        <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
          <Users className="w-3 h-3" strokeWidth={1.5} />
          <span>
            {p.linked_client_count} linked client
            {p.linked_client_count === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {p.document_count > 0 && (
        <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
          <FileText className="w-3 h-3" strokeWidth={1.5} />
          <span>
            {p.document_count} document{p.document_count === 1 ? "" : "s"}
            {p.document_expiring_count > 0 && (
              <span className="text-[var(--accent)]">
                {" "}
                · {p.document_expiring_count} expiring soon
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function AskBody({
  assistantName,
  hasAsked,
  stream,
  prompt,
  onPromptChange,
  onAsk,
  inputRef,
  showThinking,
  kind,
}: {
  assistantName: string;
  hasAsked: boolean;
  stream: StreamState;
  prompt: string;
  onPromptChange: (v: string) => void;
  onAsk: (q: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  showThinking: boolean;
  kind: Kind;
}) {
  return (
    <>
      <div className="px-3 py-3 max-h-[260px] overflow-y-auto">
        {hasAsked && stream.streaming && showThinking && (
          <div className="inline-flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            <span>
              {stream.events.length > 0
                ? streamingStatus(stream)
                : "Thinking…"}
            </span>
          </div>
        )}
        {hasAsked && (stream.finalContent || !stream.streaming) && stream.finalContent && (
          <div className="text-[13px] text-[var(--ink)] leading-relaxed">
            <MarkdownRenderer content={stream.finalContent} trace={stream.trace} />
          </div>
        )}
        {!hasAsked && (
          <div className="text-[11px] text-[var(--ink-muted)] mb-2">
            Ask anything about this {kind}.
          </div>
        )}
        {stream.error && (
          <div className="text-[11px] text-[var(--danger)]">{stream.error}</div>
        )}
      </div>
      <div className="border-t border-[var(--rule)] px-3 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAsk(prompt);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onAsk(prompt);
              }
            }}
            rows={1}
            placeholder={`Ask ${assistantName}…`}
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
    </>
  );
}

function streamingStatus(stream: StreamState): string {
  const last = stream.events[stream.events.length - 1];
  if (!last) return "Thinking…";
  if (last.type === "tool_start") return `Calling ${last.tool_name}…`;
  if (last.type === "tool_end") return `${last.tool_name} → ${last.status}`;
  if (last.type === "iteration_thinking")
    return last.summary || "Thinking…";
  return "Thinking…";
}

function relativeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
