"use client";

// AgentDock — the always-on agent presence.
//
// A floating orb in the bottom-right of every authenticated page.
// Click (or press ⌘J) to slide in a side panel scoped to whatever
// the current page is about. The panel uses the same /api/dante/ask
// streaming endpoint as the dedicated /dante surface, so citations,
// grounding, and the supervisor queue all still apply — it's just a
// different chrome.
//
// What makes this "agentic" rather than a chat shortcut:
//
//   - PageContext awareness — the dock reads useCurrentPageContext()
//     and passes the active entity into the agent payload, so asking
//     "what's the situation?" from a contact page is automatically
//     scoped to that contact.
//   - Persistent across navigation — the dock state lives at the
//     AppShell level, so opening it on /vault and then walking to
//     /properties keeps the same conversation in flight.
//   - Spill-out — the "Open in Dante" button takes the conversation
//     to /dante/chat/[id] when the user wants the full surface.
//
// Layered on top of (not replacing) the existing entity-scoped
// affordances: EntityAsk hover, ContextualAskPanel on detail pages.

import * as React from "react";
import Link from "next/link";
import {
  Send,
  Sparkles,
  X,
  Loader2,
  ArrowUpRight,
  CornerDownLeft,
} from "lucide-react";
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
import { useCurrentPageContext } from "./PageContext";
import { useAssistantBrand } from "./AssistantNameProvider";

interface DockMessage {
  role: "user" | "assistant";
  content: string;
  trace?: unknown;
  followups?: string[];
}

export default function AgentDock() {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<DockMessage[]>([]);
  const [streamState, setStreamState] = React.useState<StreamState>(
    initialStreamState(),
  );
  const [chatId, setChatId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const pageContext = useCurrentPageContext();
  const brand = useAssistantBrand();

  // Keyboard summon: ⌘J / Ctrl+J anywhere toggles the dock.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Autofocus input when the panel opens.
  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 160);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Auto-scroll to bottom on new content.
  React.useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamState.finalContent, streamState.events.length]);

  const submit = async () => {
    const q = input.trim();
    if (!q || streamState.streaming) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: q }]);

    // Abort any prior stream (defensive — shouldn't be in flight).
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Map page context to the agent body's context_* fields when we
    // can. The agent loop already understands contact_id and property_id
    // scoping; other entity kinds fall through to the generic prompt.
    const body: Parameters<typeof consumeAgentStream>[0]["body"] = {
      message: q,
      chat_id: chatId ?? undefined,
    };
    if (pageContext?.entity?.kind === "contact") {
      body.context_contact_id = pageContext.entity.id;
      body.context_contact_name = pageContext.entity.label;
    } else if (pageContext?.entity?.kind === "property") {
      body.context_property_id = pageContext.entity.id;
      body.context_property_label = pageContext.entity.label;
    }

    try {
      await consumeAgentStream({
        body,
        signal: ctrl.signal,
        onUpdate: (s) => {
          setStreamState(s);
          if (s.chatId && !chatId) setChatId(s.chatId);
        },
      });
      // Stream finished — promote the final answer into messages and
      // reset the stream state so the next turn starts fresh.
      setStreamState((finalState) => {
        if (finalState.finalContent) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: finalState.finalContent,
              trace: finalState.trace,
              followups: finalState.followups,
            },
          ]);
        }
        return initialStreamState();
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message || "Something went wrong");
      setStreamState(initialStreamState());
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const startFresh = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreamState(initialStreamState());
    setChatId(null);
    setError(null);
    setInput("");
  };

  const placeholder = pageContext?.entity
    ? `Ask ${brand.name} about ${pageContext.entity.label}…`
    : pageContext?.title
      ? `Ask ${brand.name} about ${pageContext.title}…`
      : `Ask ${brand.name} anything…`;

  return (
    <>
      {/* Floating trigger — visible on every authed page, lower-right. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? `Close ${brand.name}` : `Ask ${brand.name}`}
        title={`${brand.name} · ⌘J`}
        className={`fixed bottom-5 right-5 z-40 group inline-flex items-center gap-2 rounded-full pl-3 pr-3 py-2 border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)] shadow-floating hover:shadow-raised transition-all duration-150 ease-out-quart ${
          open ? "translate-y-[2px] opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
        }`}
      >
        <span
          className="relative inline-flex w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#3351ff] to-[#70d4b4] animate-glow-pulse"
          aria-hidden
        />
        <span className="text-sm font-medium">{brand.name}</span>
        <kbd className="hidden md:inline-flex items-center text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] border border-[var(--rule)] rounded-[3px] px-1 py-0.5">
          ⌘J
        </kbd>
      </button>

      {/* Backdrop — soft, dismisses on click, only when open. */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!open}
      />

      {/* Side panel — slides in from right. */}
      <aside
        role="dialog"
        aria-label={`${brand.name} side panel`}
        className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[440px] bg-[var(--canvas)] border-l border-[var(--rule)] shadow-floating flex flex-col transition-transform duration-250 ease-out-quart ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule)] gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="relative inline-flex w-2 h-2 rounded-full bg-gradient-to-br from-[#3351ff] to-[#70d4b4]"
              aria-hidden
            />
            <span className="text-sm font-semibold text-[var(--ink)] truncate">
              {brand.name}
            </span>
            {pageContext && (
              <>
                <span className="text-[var(--ink-subtle)]">·</span>
                <span className="text-xs text-[var(--ink-muted)] truncate">
                  {pageContext.entity?.label ?? pageContext.title}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                onClick={startFresh}
                className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] px-2 py-1 rounded-[3px] hover:bg-[var(--canvas-subtle)] transition"
                title="Start a new conversation"
              >
                New
              </button>
            )}
            {chatId && (
              <Link
                href={`/dante/chat/${chatId}`}
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] px-2 py-1 rounded-[3px] hover:bg-[var(--canvas-subtle)] transition"
                title={`Open in full ${brand.name}`}
              >
                Open
                <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
              </Link>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {messages.length === 0 && !streamState.streaming && (
            <DockEmptyState
              brand={brand}
              pageContext={pageContext}
              onPick={(q) => {
                setInput(q);
                inputRef.current?.focus();
              }}
            />
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserMessage key={i} content={m.content} />
            ) : (
              <AssistantMessage
                key={i}
                content={m.content}
                trace={m.trace}
                followups={m.followups || []}
                citationReport={null}
                grounding={null}
                onOpenEditor={() => undefined}
                onRewrite={() => undefined}
                onFollowup={(q) => {
                  setInput(q);
                  inputRef.current?.focus();
                }}
                rewriting={false}
                chatId={chatId ?? undefined}
              />
            ),
          )}

          {streamState.streaming && (
            <LiveThinking state={streamState} deep={false} />
          )}

          {error && (
            <div className="rounded-[4px] border border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[var(--danger)] text-xs px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-[var(--rule)] p-3">
          <div className="rounded-[8px] border border-[var(--rule)] bg-[var(--canvas)] focus-within:border-[var(--accent)]/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={2}
              className="w-full resize-none bg-transparent px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
              disabled={streamState.streaming}
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-[10px] mono text-[var(--ink-subtle)]">
                <CornerDownLeft className="inline w-2.5 h-2.5 mr-1" strokeWidth={1.7} />
                send
              </span>
              <button
                onClick={submit}
                disabled={!input.trim() || streamState.streaming}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.97]"
              >
                {streamState.streaming ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" strokeWidth={1.7} />
                )}
                Ask
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function DockEmptyState({
  brand,
  pageContext,
  onPick,
}: {
  brand: { name: string };
  pageContext: ReturnType<typeof useCurrentPageContext>;
  onPick: (q: string) => void;
}) {
  // Page-aware starter prompts — derive from context when we have it,
  // fall back to general advisor/realtor prompts.
  const prompts = React.useMemo(() => {
    if (pageContext?.entity?.kind === "contact") {
      const label = pageContext.entity.label;
      return [
        `Summarize what we know about ${label}`,
        `Draft a follow-up to ${label}`,
        `What should I prep before my next call with ${label}?`,
      ];
    }
    if (pageContext?.entity?.kind === "property") {
      const label = pageContext.entity.label;
      return [
        `Summarize ${label}`,
        `Are any documents on ${label} expiring soon?`,
        `Who's linked to ${label}?`,
      ];
    }
    if (pageContext?.title) {
      return [
        `What should I be looking at on this page?`,
        `Summarize ${pageContext.title}`,
        `What's pending review here?`,
      ];
    }
    return [
      "What needs my attention today?",
      "Show me clients with stale outreach",
      "Draft a check-in for a quiet client",
    ];
  }, [pageContext]);

  return (
    <div className="space-y-3 py-2">
      <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" strokeWidth={1.5} />
        {pageContext?.entity ? "On this entity" : pageContext ? "On this page" : "Suggested"}
      </div>
      <div className="space-y-1">
        {prompts.map((p, i) => (
          <button
            key={i}
            onClick={() => onPick(p)}
            className="w-full text-left px-3 py-2 rounded-[6px] border border-[var(--rule)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)] text-sm text-[var(--ink)] transition flex items-start gap-2"
          >
            <span className="text-[var(--ink-subtle)] mt-0.5">→</span>
            <span className="flex-1">{p}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[var(--ink-subtle)] leading-relaxed pt-2">
        {brand.name} can see {pageContext?.entity?.label ? "this entity" : "the page you're on"} and will cite any document or memory it relies on. Press{" "}
        <kbd className="mono text-[10px] border border-[var(--rule)] rounded-[3px] px-1 py-0.5">⌘J</kbd> to summon from anywhere.
      </p>
    </div>
  );
}
