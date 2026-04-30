"use client";

// GlobalSearchModal — ⌘K palette. Two modes, switchable inline:
//
//   Search:  fuzzy across vault, projects, contacts, properties,
//            prompts, review tables, reminders. Arrow keys + enter.
//   Ask:     unscoped chat with D/V over the same agent loop /dante
//            uses, streamed inline. Enter to submit; opens-in-/dante
//            link routes to the persistent thread when the user
//            wants more room.
//
// The toggle is meant to feel like a single keystroke — the "Ask"
// mode is the closest D/V gets to the user without leaving the page
// they're on. ⌘K opens in Search by default; ⌘/ opens straight in
// Ask (mnemonic: "ask").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  Users,
  Home,
  FolderClosed,
  FileText,
  Table2,
  BookOpen,
  Bell,
  Loader2,
  CornerDownLeft,
  X,
  Send,
  ExternalLink,
} from "lucide-react";
import {
  consumeAgentStream,
  initialStreamState,
  type StreamState,
} from "@/app/dante/streamClient";
import MarkdownRenderer from "@/app/dante/MarkdownRenderer";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";
import AgentPlan from "@/components/dante/AgentPlan";
import type { StepLogEntry } from "@/lib/dante/workflow-types";

type Kind =
  | "vault_item"
  | "vault_project"
  | "property"
  | "contact"
  | "library_prompt"
  | "review_table"
  | "reminder";

interface SearchResult {
  id: string;
  kind: Kind;
  title: string;
  subtitle?: string;
  href: string;
}

const KIND_ICON: Record<Kind, React.ComponentType<any>> = {
  vault_item: FileText,
  vault_project: FolderClosed,
  property: Home,
  contact: Users,
  library_prompt: BookOpen,
  review_table: Table2,
  reminder: Bell,
};

const KIND_LABEL: Record<Kind, string> = {
  vault_item: "Vault item",
  vault_project: "Vault project",
  property: "Property",
  contact: "Contact",
  library_prompt: "Prompt",
  review_table: "Review table",
  reminder: "Reminder",
};

type Mode = "search" | "ask";

interface AskTurn {
  role: "user" | "assistant";
  content: string;
  /** Captured trace from the agent run; powers citation chip
   *  resolution in MarkdownRenderer. Empty for user turns. */
  trace: StepLogEntry[];
}

export default function GlobalSearchModal({
  open,
  onClose,
  initialMode = "search",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const router = useRouter();
  const { name: assistantName } = useAssistantBrand();

  const [mode, setMode] = useState<Mode>(initialMode);

  // ── Search state ─────────────────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchKind, setSearchKind] = useState<"recent" | "search">("recent");

  // ── Ask state ────────────────────────────────────────────────
  const askInputRef = useRef<HTMLTextAreaElement>(null);
  const askScrollRef = useRef<HTMLDivElement>(null);
  const [askInput, setAskInput] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [stream, setStream] = useState<StreamState>(initialStreamState());
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  // Reset on every fresh open. Honor the requested initial mode.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setQ("");
    setResults([]);
    setActiveIndex(0);
    setAskInput("");
    setTurns([]);
    setStream(initialStreamState());
    setChatId(undefined);
    setTimeout(() => {
      if (initialMode === "ask") askInputRef.current?.focus();
      else inputRef.current?.focus();
    }, 0);
  }, [open, initialMode]);

  // Refocus the right input when the user toggles modes.
  useEffect(() => {
    if (!open) return;
    if (mode === "ask") askInputRef.current?.focus();
    else inputRef.current?.focus();
  }, [mode, open]);

  // Auto-scroll the Ask transcript as it streams.
  useEffect(() => {
    if (askScrollRef.current) {
      askScrollRef.current.scrollTop = askScrollRef.current.scrollHeight;
    }
  }, [turns.length, stream.events.length, stream.finalContent]);

  // Cancel any in-flight stream when the modal closes.
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [open]);

  // ── Search fetch (debounced) ─────────────────────────────────
  useEffect(() => {
    if (!open || mode !== "search") return;
    setLoading(true);
    const controller = new AbortController();
    const t = setTimeout(
      async () => {
        try {
          const r = await fetch(
            `/api/search?q=${encodeURIComponent(q.trim())}`,
            { credentials: "include", signal: controller.signal },
          );
          if (!r.ok) throw new Error("fail");
          const j = await r.json();
          setResults(Array.isArray(j.results) ? j.results : []);
          setSearchKind(j.mode === "search" ? "search" : "recent");
          setActiveIndex(0);
        } catch {
          if (!controller.signal.aborted) setResults([]);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      q.trim().length < 2 ? 0 : 200,
    );
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [q, open, mode]);

  const grouped = useMemo(() => {
    const map = new Map<Kind, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.kind) || [];
      arr.push(r);
      map.set(r.kind, arr);
    }
    const order: Kind[] = [
      "contact",
      "property",
      "vault_project",
      "vault_item",
      "review_table",
      "library_prompt",
      "reminder",
    ];
    return order
      .filter((k) => map.has(k))
      .map((k) => ({ kind: k, items: map.get(k)! }));
  }, [results]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const openItem = useCallback(
    (item: SearchResult) => {
      onClose();
      router.push(item.href);
    },
    [onClose, router],
  );

  // ── Ask submit ───────────────────────────────────────────────
  const ask = useCallback(
    async (question: string) => {
      const qn = question.trim();
      if (!qn || stream.streaming) return;
      setAskInput("");
      setTurns((t) => [...t, { role: "user", content: qn, trace: [] }]);
      setStream({ ...initialStreamState(), streaming: true });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await consumeAgentStream({
          body: { message: qn, chat_id: chatId },
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
    [stream.streaming, chatId],
  );

  // ── Keyboard ─────────────────────────────────────────────────
  // Search: ↑↓ to move, Enter to open, Esc to close, Tab to switch to Ask.
  // Ask:    Enter to submit, Shift+Enter for newline, Esc to close,
  //         Tab to switch back to Search.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && !e.shiftKey) {
        // Tab cycles modes only when the input is focused — otherwise
        // it falls through to the browser's normal focus order.
        const active = document.activeElement;
        if (
          active === inputRef.current ||
          active === askInputRef.current
        ) {
          e.preventDefault();
          setMode((m) => (m === "search" ? "ask" : "search"));
        }
        return;
      }
      if (mode === "search") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          const item = flat[activeIndex];
          if (item) openItem(item);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode, flat, activeIndex, openItem, onClose]);

  if (!open) return null;

  const showThinking = stream.streaming && !stream.finalContent;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[var(--ink)]/30 backdrop-blur-sm pt-24 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[8px] shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[80vh]">
        {/* Mode toggle row */}
        <div className="flex items-center gap-1 px-3 pt-2.5 border-b border-[var(--rule)]">
          <button
            onClick={() => setMode("search")}
            className="px-3 py-1.5 text-xs rounded-t-[4px] transition"
            style={{
              borderBottom:
                mode === "search"
                  ? "2px solid var(--ink)"
                  : "2px solid transparent",
              color:
                mode === "search" ? "var(--ink)" : "var(--ink-muted)",
              fontWeight: mode === "search" ? 600 : 400,
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Search className="w-3 h-3" strokeWidth={1.5} />
              Search
            </span>
          </button>
          <button
            onClick={() => setMode("ask")}
            className="px-3 py-1.5 text-xs rounded-t-[4px] transition"
            style={{
              borderBottom:
                mode === "ask" ? "2px solid var(--ink)" : "2px solid transparent",
              color: mode === "ask" ? "var(--ink)" : "var(--ink-muted)",
              fontWeight: mode === "ask" ? 600 : 400,
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" strokeWidth={1.5} />
              Ask {assistantName}
            </span>
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-1 mt-1 rounded text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
            title="Close"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {mode === "search" ? (
          <>
            {/* Search input row */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule)]">
              {loading ? (
                <Loader2
                  className="w-4 h-4 text-[var(--ink-muted)] animate-spin"
                  strokeWidth={1.5}
                />
              ) : (
                <Search
                  className="w-4 h-4 text-[var(--ink-muted)]"
                  strokeWidth={1.5}
                />
              )}
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search across vault, contacts, properties, prompts…"
                className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
              />
            </div>

            {/* Search results */}
            <div className="max-h-[400px] overflow-y-auto">
              {searchKind === "recent" && flat.length > 0 && (
                <div className="px-4 pt-3 pb-1 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] flex items-center gap-2">
                  <span>Recent</span>
                  <span className="text-[var(--ink-subtle)]">·</span>
                  <span className="text-[var(--ink-subtle)] normal-case tracking-normal">
                    Type to search
                  </span>
                </div>
              )}
              {flat.length === 0 && !loading ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
                  {q.trim().length < 2
                    ? "Nothing in this workspace yet."
                    : `No matches for "${q}".`}
                </div>
              ) : (
                grouped.map((g) => {
                  const Icon = KIND_ICON[g.kind];
                  return (
                    <div
                      key={g.kind}
                      className="border-b border-[var(--rule)] last:border-b-0"
                    >
                      <div className="px-4 pt-3 pb-1.5 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                        {KIND_LABEL[g.kind]}
                      </div>
                      <ul>
                        {g.items.map((item) => {
                          const flatIdx = flat.findIndex((x) => x === item);
                          const active = flatIdx === activeIndex;
                          return (
                            <li key={`${item.kind}:${item.id}`}>
                              <button
                                onClick={() => openItem(item)}
                                onMouseEnter={() => setActiveIndex(flatIdx)}
                                className="w-full flex items-center gap-3 px-4 py-2 text-left transition"
                                style={{
                                  background: active
                                    ? "var(--canvas-subtle)"
                                    : "transparent",
                                }}
                              >
                                <Icon
                                  className="w-4 h-4 text-[var(--ink-muted)] shrink-0"
                                  strokeWidth={1.5}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-[var(--ink)] truncate">
                                    {item.title}
                                  </div>
                                  {item.subtitle && (
                                    <div className="text-[11px] text-[var(--ink-subtle)] truncate">
                                      {item.subtitle}
                                    </div>
                                  )}
                                </div>
                                {active && (
                                  <CornerDownLeft
                                    className="w-3 h-3 text-[var(--ink-subtle)] shrink-0"
                                    strokeWidth={1.5}
                                  />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2 border-t border-[var(--rule)] flex items-center justify-between text-[10px] text-[var(--ink-subtle)] mono">
              <div className="flex items-center gap-3">
                <span>↑↓ navigate</span>
                <span>↵ open</span>
                <span>tab → ask {assistantName}</span>
                <span>esc close</span>
              </div>
              <span>
                {flat.length} result{flat.length === 1 ? "" : "s"}
              </span>
            </div>
          </>
        ) : (
          <>
            {/* Ask transcript */}
            <div
              ref={askScrollRef}
              className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-[200px]"
            >
              {turns.length === 0 && !stream.streaming && (
                <div className="text-xs text-[var(--ink-muted)] space-y-2">
                  <p>
                    Ask {assistantName} anything across your workspace —
                    clients, properties, vault, recent emails. Replies are
                    streamed and grounded in your data.
                  </p>
                  <p className="text-[var(--ink-subtle)]">
                    Tip: open a property or client first to ask in context.
                  </p>
                </div>
              )}
              {turns.map((t, i) => (
                <div key={i}>
                  <div className="text-xs mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1.5">
                    {t.role === "user" ? "You" : assistantName}
                  </div>
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
                      <Loader2
                        className="w-3 h-3 animate-spin"
                        strokeWidth={1.5}
                      />
                      {stream.events.length > 0 ? (
                        <span>
                          {(() => {
                            const last =
                              stream.events[stream.events.length - 1];
                            if (last.type === "tool_start")
                              return `Calling ${last.tool_name}…`;
                            if (last.type === "tool_end")
                              return `${last.tool_name} → ${last.status}`;
                            if (last.type === "iteration_thinking")
                              return (
                                last.summary ||
                                `Thinking (step ${last.iteration})…`
                              );
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
                        <MarkdownRenderer content={stream.finalContent} trace={stream.trace} />
                      </div>
                      {!stream.streaming && <AgentPlan trace={stream.trace} />}
                    </>
                  )}
                </div>
              )}
              {stream.error && (
                <div className="text-xs text-[var(--danger)]">{stream.error}</div>
              )}
            </div>

            {/* Ask composer */}
            <div className="border-t border-[var(--rule)] px-4 py-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(askInput);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={askInputRef}
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(askInput);
                    }
                  }}
                  rows={1}
                  placeholder={`Ask ${assistantName}…`}
                  className="flex-1 resize-none bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none max-h-32 py-2"
                />
                <button
                  type="submit"
                  disabled={!askInput.trim() || stream.streaming}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 transition"
                  title="Send"
                >
                  {stream.streaming ? (
                    <Loader2
                      className="w-3.5 h-3.5 animate-spin"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                  )}
                </button>
              </form>
              <div className="px-1 pt-1 flex items-center justify-between text-[10px] text-[var(--ink-subtle)] mono">
                <div className="flex items-center gap-3">
                  <span>↵ send</span>
                  <span>shift+↵ newline</span>
                  <span>tab → search</span>
                  <span>esc close</span>
                </div>
                {chatId && (
                  <Link
                    href={`/dante/chat/${chatId}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 hover:text-[var(--ink)] transition"
                  >
                    Open in {assistantName}
                    <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.5} />
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
