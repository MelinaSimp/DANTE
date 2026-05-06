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
  Paperclip,
  Lock,
} from "lucide-react";
import {
  consumeAgentStream,
  initialStreamState,
  type StreamState,
} from "@/app/dante/streamClient";
import MarkdownRenderer from "@/app/dante/MarkdownRenderer";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";
import AgentPlan from "@/components/dante/AgentPlan";
import CreativeCard from "@/components/ui/creative-card";
import type { StepLogEntry } from "@/lib/dante/workflow-types";
import { useCurrentPageContext } from "@/components/dante/PageContext";

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
  seedPrompt,
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
  /** Optional pre-filled question. When set and the modal opens in
   *  Ask mode, the textarea is seeded so the user can edit or submit
   *  the suggested prompt. Used by surfaces like the WhatChanged
   *  panel's "Ask Dante what these mean for my book" button. */
  seedPrompt?: string;
}) {
  const router = useRouter();
  const { name: assistantName } = useAssistantBrand();
  const pageContext = useCurrentPageContext();

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
  // Composer attachments — extracted text from files the user
  // picks via the paperclip. When present, the server forces the
  // turn to local_only (Hermes composes the reply). Cleared after
  // each successful send.
  type Attachment = {
    name: string;
    path: string;
    ext: string;
    text: string;
    truncated: boolean;
    char_count: number;
  };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);

  // Reset on every fresh open. Honor the requested initial mode and
  // seed the Ask textarea if a seedPrompt was passed in.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setQ("");
    setResults([]);
    setActiveIndex(0);
    setAskInput(seedPrompt ?? "");
    setTurns([]);
    setStream(initialStreamState());
    setChatId(undefined);
    setTimeout(() => {
      if (initialMode === "ask") {
        const ta = askInputRef.current;
        if (ta) {
          ta.focus();
          // Move cursor to end so the user can either edit or just
          // press Enter to submit the suggested prompt.
          if (seedPrompt) ta.setSelectionRange(seedPrompt.length, seedPrompt.length);
        }
      } else {
        inputRef.current?.focus();
      }
    }, 0);
  }, [open, initialMode, seedPrompt]);

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

      // Page-aware scoping. When the user opens ⌘D from a page that
      // registered an entity (a contact, a property), thread that into
      // the agent body so context_contact_id / context_property_id are
      // already set — the same fields the per-detail-page
      // ContextualAskPanel + EntityAsk use. The agent's tool whitelist
      // and citation pipeline already understand these scopes.
      const body: Parameters<typeof consumeAgentStream>[0]["body"] = {
        message: qn,
        chat_id: chatId,
      };
      if (pageContext?.entity?.kind === "contact") {
        body.context_contact_id = pageContext.entity.id;
        body.context_contact_name = pageContext.entity.label;
      } else if (pageContext?.entity?.kind === "property") {
        body.context_property_id = pageContext.entity.id;
        body.context_property_label = pageContext.entity.label;
      }
      // Snapshot attachments at send-time and clear so the next
      // turn starts clean. The server inlines them into the
      // objective and forces local_only for the run.
      if (attachments.length > 0) {
        body.attachments = attachments.map((a) => ({
          name: a.name,
          ext: a.ext,
          text: a.text,
          truncated: a.truncated,
        }));
        setAttachments([]);
      }

      try {
        await consumeAgentStream({
          body,
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
    [stream.streaming, chatId, attachments, pageContext],
  );

  // Paperclip → OS file picker (multi-select). Each picked file is
  // read in the Electron main process; only extracted text crosses
  // back. Web (non-Electron) builds: the button is disabled and
  // tooltipped to explain why.
  const pickAttachments = useCallback(async () => {
    const local = window.driftLocal;
    if (!local?.pickAndReadFiles) {
      alert(
        "File attachments require the Drift desktop app — install from /download.",
      );
      return;
    }
    setAttaching(true);
    try {
      const picked = await local.pickAndReadFiles();
      if (!picked || picked.length === 0) return;
      // Skip files that errored on extraction; surface a count
      // separately so the user knows we didn't silently drop them.
      const ok = picked.filter((f) => !f.error && f.text);
      const errored = picked.filter((f) => f.error || !f.text);
      if (errored.length > 0) {
        alert(
          `Couldn't extract text from ${errored.length} file(s): ${errored.map((f) => f.name).join(", ")}.`,
        );
      }
      setAttachments((prev) => {
        const byPath = new Map(prev.map((p) => [p.path, p]));
        for (const f of ok) {
          byPath.set(f.path, {
            name: f.name,
            path: f.path,
            ext: f.ext,
            text: f.text,
            truncated: f.truncated,
            char_count: f.text.length,
          });
        }
        return [...byPath.values()].slice(0, 8); // server caps at 8
      });
    } finally {
      setAttaching(false);
    }
  }, []);

  const removeAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }, []);

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

  // Ask mode wears the Creative Card chrome — rounded-2xl outer, top-
  // left glow, gradient padding ring — to match the entity hover
  // surface and signal "this is where Dante speaks." Search mode keeps
  // the existing rectangle since it's a utilitarian palette, not a
  // chat. ⌘D anchors Ask mode to a more centred vertical position
  // since the user hits it expecting Dante front-and-center, not a
  // top-of-page strip.
  const isAsk = mode === "ask";
  return (
    <div
      className={`fixed inset-0 z-[9999] flex justify-center bg-[var(--ink)]/60 backdrop-blur-md px-4 ${
        isAsk
          ? "items-center"
          : "items-start pt-24"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <CreativeCard className="w-full max-w-2xl">
        <div className="flex flex-col max-h-[80vh] overflow-hidden">
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
          {/* Page-scope indicator — visible only in ask mode, only when
           *  a page has registered an entity. Tells the user that
           *  ⌘D is automatically scoped to what they're looking at. */}
          {mode === "ask" && pageContext?.entity && (
            <span
              className="hidden sm:inline-flex items-center gap-1.5 self-center mr-1 px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] mono uppercase tracking-wider"
              title={`Questions are scoped to this ${pageContext.entity.kind.replace("_", " ")}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              <span className="truncate max-w-[160px]">{pageContext.entity.label}</span>
            </span>
          )}
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
                <div className="flex flex-col items-center justify-center text-center py-8 px-4">
                  <Sparkles
                    className="w-6 h-6 text-[var(--ink-subtle)] mb-3"
                    strokeWidth={1.5}
                  />
                  <p className="text-sm text-[var(--ink)] font-medium mb-1">
                    Ask {assistantName} anything about your workspace
                  </p>
                  <p className="text-xs text-[var(--ink-muted)] max-w-md">
                    Clients, properties, vault docs, regulatory updates —
                    Dante grounds every reply in your actual data.
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
            <div className="border-t border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.02))] px-4 py-3">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {attachments.map((a) => (
                    <span
                      key={a.path}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule)] bg-[var(--canvas)] pl-2.5 pr-1 py-1 text-xs"
                      title={`${a.path}\n${a.char_count} chars${a.truncated ? " (truncated)" : ""}`}
                    >
                      <Lock className="w-3 h-3 text-[var(--ink-muted)]" strokeWidth={1.75} />
                      <span className="truncate max-w-[20ch]">{a.name}</span>
                      <span className="mono text-[10px] text-[var(--ink-muted)]">
                        {`${Math.max(1, Math.round(a.char_count / 1000))}k${a.truncated ? "*" : ""}`}
                      </span>
                      <button
                        onClick={() => removeAttachment(a.path)}
                        className="rounded-full p-0.5 text-[var(--ink-muted)] hover:bg-[var(--rule)]/40 hover:text-[var(--ink)]"
                        aria-label={`Remove ${a.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1 mono text-[10px] text-[var(--ink-muted)] uppercase tracking-wide pl-1">
                    <Lock className="w-2.5 h-2.5" strokeWidth={2} />
                    Routes through Hermes — bytes stay local
                  </span>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(askInput);
                }}
                className="flex items-end gap-2"
              >
                {/* Bordered input shell — gives the textarea a clear
                    visual footprint so users see "type here" without
                    having to find a transparent area. The border
                    deepens on focus-within for a clear active state. */}
                <div className="flex-1 flex items-end gap-2 rounded-[8px] border border-[var(--rule-strong,var(--rule))] bg-[var(--canvas)] px-3 py-2 transition focus-within:border-[var(--ink)] focus-within:shadow-[0_0_0_3px_rgba(51,81,255,0.08)]">
                  <button
                    type="button"
                    onClick={pickAttachments}
                    disabled={attaching || stream.streaming}
                    title="Attach a file from your machine. Bytes stay local; the question routes through Hermes."
                    aria-label="Attach file"
                    className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--ink-muted)] hover:bg-[var(--rule)]/30 hover:text-[var(--ink)] disabled:opacity-40 transition"
                  >
                    {attaching ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Paperclip className="w-4 h-4" strokeWidth={1.5} />
                    )}
                  </button>
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
                    placeholder={
                      pageContext?.entity
                        ? `Ask ${assistantName} about ${pageContext.entity.label}…`
                        : pageContext?.title && pageContext.title !== "Dashboard"
                          ? `Ask ${assistantName} about ${pageContext.title}…`
                          : `Ask ${assistantName} anything…`
                    }
                    className="flex-1 resize-none bg-transparent text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none max-h-40 leading-relaxed"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!askInput.trim() || stream.streaming}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-[8px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 transition"
                  title="Send (Enter)"
                  aria-label="Send"
                >
                  {stream.streaming ? (
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <Send className="w-4 h-4" strokeWidth={1.5} />
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
      </CreativeCard>
    </div>
  );
}
