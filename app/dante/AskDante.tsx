"use client";

// app/dante/AskDante.tsx
//
// Harvey-style chat surface for /dante. Two modes:
//
//   Landing (no messages yet):
//     - Big "D" wordmark
//     - Optional contact-context chip
//     - Centered input with toolbar
//     - Knowledge source pills
//     - Recent chats collapsible
//
//   Expanded (after first ask):
//     - Wordmark + pills fade out
//     - User+assistant messages stack vertically with no chat bubbles,
//       just clean prose like Harvey
//     - Each assistant message has an action bar (Copy / Export /
//       Rewrite / Open in editor / 👍 / 👎), a Sources block, and
//       suggested follow-ups
//     - Input pins to the bottom for follow-up turns
//
// State is local — refreshing the page returns to the landing.
// Persistent threads live at /dante/chat/[id]; the History collapsible
// links there.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Library,
  Sliders,
  Telescope,
  Database,
  BookOpen,
  Users,
  CalendarDays,
  Workflow,
  History,
  X,
  Search,
  Globe,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { deriveFilenameStem } from "./DocumentPanel";
import DraftEditor from "@/components/dante/DraftEditor";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";
import {
  consumeAgentStream,
  type StreamState,
  initialStreamState,
} from "./streamClient";
import {
  UserMessage,
  AssistantMessage,
  LiveThinking,
} from "./MessageView";

// ── Types ────────────────────────────────────────────────────────

interface RecentChat {
  id: string;
  title: string;
  updated_at: string;
}

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
}

interface AssistantTurn {
  role: "assistant";
  content: string;
  trace: unknown;
  followups: string[];
  /** Captured from streamState.citationReport at turn finalization. */
  citationReport?: import("./streamClient").CitationReportState | null;
  grounding?: import("./streamClient").GroundingState | null;
}

interface UserTurn {
  role: "user";
  content: string;
}

type Turn = UserTurn | AssistantTurn;

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

// Quick-jump pills under the landing input. Each routes to its real
// page so the "Memory" / "Vault" / etc. labels aren't decorative —
// click them and you land on the workspace's archive, vault docs,
// contacts list, calendar, or workflows builder. Workflows added
// because the user uses it daily; without it the pill row was just
// a passive legend.
const KNOWLEDGE_SOURCES = [
  { label: "Memory", icon: Database, href: "/dante/archive" },
  { label: "Vault", icon: BookOpen, href: "/vault" },
  { label: "Contacts", icon: Users, href: "/client-details-overview" },
  { label: "Calendar", icon: CalendarDays, href: "/calendar" },
  { label: "Workflows", icon: Workflow, href: "/dante/workflows" },
] as const;

// Workflow tiles surfaced on the landing — the four highest-value
// templates curated for first-time-feel. Picked manually rather
// than slicing the full list from lib/dante/templates.ts because
// (a) the bundle size for the gallery's full registry is wasted on
// a 4-card preview and (b) the order matters for the buyer
// demographic — meeting prep + post-meeting + QBR + life event
// reads as the day-job of an advisor; the niche templates can wait
// for the /dante/workflows page proper.
const RECOMMENDED_WORKFLOWS = [
  { slug: "meeting-prep-packet", name: "Draft a meeting prep packet", kindLabel: "Draft", steps: 5 },
  { slug: "post-meeting-followup", name: "Generate post-meeting follow-up", kindLabel: "Output", steps: 4 },
  { slug: "qbr-reminder", name: "Quarterly review reminders", kindLabel: "Output", steps: 4 },
  { slug: "life-event-detector", name: "Surface client life events", kindLabel: "Review", steps: 5 },
] as const;

const REWRITE_PRESETS = [
  { label: "Shorter", instruction: "Make it shorter — half the length, same key facts." },
  { label: "Bullets", instruction: "Rewrite as a bulleted list." },
  { label: "More formal", instruction: "Rewrite in a more formal, client-facing tone." },
  { label: "Add example", instruction: "Add a concrete example illustrating the main point." },
] as const;

// ── Component ────────────────────────────────────────────────────

export default function AskDante({
  assistantName = "Dante",
}: {
  /** Brand name of the assistant — "Dante" for FA, "Vergil" for RE. */
  assistantName?: string;
}) {
  // Brand info (name + iconPath) flows from /dante/layout.tsx via the
  // AssistantNameProvider context. The prop above is a legacy override
  // — we keep it for the InputBar placeholder, but the hero icon
  // reads from context so it always matches the breadcrumb gate.
  const brand = useAssistantBrand();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState());
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  // Vergil-only — when true the composer routes to /api/dante/web-scrape
  // (Anthropic Web Scraper managed agent). Mutually exclusive with
  // deepResearch; the toolbar enforces that.
  const [webScrape, setWebScrape] = useState(false);
  const [refining, setRefining] = useState<"customize" | "rewrite" | null>(null);
  const [contextContact, setContextContact] = useState<Contact | null>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [editorContent, setEditorContent] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const inExpandedMode = turns.length > 0 || streamState.streaming;

  const refreshRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/chats");
      const json = await res.json();
      setRecent((json.chats || []) as RecentChat[]);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    refreshRecent();
    return () => abortRef.current?.abort();
  }, [refreshRecent]);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, streamState.streaming, streamState.events.length, streamState.followups.length]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const submit = async (overrideInput?: string) => {
    const message = (overrideInput ?? input).trim();
    if (!message || streamState.streaming) return;

    abortRef.current = new AbortController();
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setStreamState({ ...initialStreamState(), streaming: true });

    try {
      let captured: StreamState = initialStreamState();
      // Mode → endpoint routing. Three modes:
      //   • web-scrape (Vergil "Pull comps") → /api/dante/web-scrape
      //   • deep-research (Telescope toggle) → /api/dante/deep-research
      //   • default chat → /api/dante/ask
      // Each managed-agent endpoint speaks the same SSE protocol, so
      // the consumer doesn't change. Contact/property scope is dropped
      // for managed-agent runs since those agents have no Drift vault
      // access — they read the open web.
      const isManagedAgent = webScrape || deepResearch;
      const endpoint = webScrape
        ? "/api/dante/web-scrape"
        : deepResearch
          ? "/api/dante/deep-research"
          : "/api/dante/ask";
      await consumeAgentStream({
        endpoint,
        body: {
          message,
          deep: deepResearch,
          context_contact_id: isManagedAgent ? undefined : contextContact?.id,
          context_contact_name: isManagedAgent ? undefined : (contextContact?.name || undefined),
        },
        signal: abortRef.current.signal,
        onUpdate: (next) => {
          captured = next;
          setStreamState(next);
        },
      });
      // Stream ended — flush the assistant turn into the persistent
      // turns list so subsequent renders show it like history. Reset
      // streamState so the live trace clears.
      const assistantTurn: AssistantTurn = {
        role: "assistant",
        content: captured.finalContent || "(no response)",
        trace: captured.trace,
        followups: captured.followups || [],
        citationReport: captured.citationReport ?? null,
        grounding: captured.grounding ?? null,
      };
      setTurns((prev) => [...prev, assistantTurn]);
      setStreamState(initialStreamState());
      refreshRecent();
    } catch (err) {
      setStreamState((prev) => ({
        ...prev,
        streaming: false,
        error: err instanceof Error ? err.message : "request_failed",
      }));
    }
  };

  const onCustomize = async () => {
    const text = input.trim();
    if (!text || refining) return;
    setRefining("customize");
    try {
      const res = await fetch("/api/dante/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "prompt", text }),
      });
      const json = await res.json();
      if (res.ok && json.text) {
        setInput(json.text);
        textareaRef.current?.focus();
      }
    } catch {
      /* swallow */
    } finally {
      setRefining(null);
    }
  };

  const onRewriteLast = async (instruction: string) => {
    // Rewrites the latest assistant turn's content per the chosen
    // preset. Citations are preserved verbatim by the refine endpoint.
    const lastIdx = [...turns].reverse().findIndex((t) => t.role === "assistant");
    if (lastIdx < 0 || refining) return;
    const realIdx = turns.length - 1 - lastIdx;
    const assistant = turns[realIdx] as AssistantTurn;
    setRefining("rewrite");
    try {
      const res = await fetch("/api/dante/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "answer", text: assistant.content, instruction }),
      });
      const json = await res.json();
      if (res.ok && json.text) {
        setTurns((prev) => {
          const next = [...prev];
          next[realIdx] = { ...assistant, content: json.text };
          return next;
        });
      }
    } catch {
      /* swallow */
    } finally {
      setRefining(null);
    }
  };

  const usePrompt = (prompt: string) => {
    setInput(prompt);
    setPromptsOpen(false);
    textareaRef.current?.focus();
  };

  const useFollowup = (q: string) => {
    submit(q);
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-[760px] mx-auto pb-32">
      {/* Landing — wordmark + scope chip. Wrapper opacity-/translate-
          transitions so the shift to expanded mode feels smooth
          rather than a hard cut. */}
      <div
        className={`transition-all duration-500 ease-out ${
          inExpandedMode
            ? "opacity-0 -translate-y-4 max-h-0 overflow-hidden pointer-events-none"
            : "opacity-100 max-h-[400px]"
        }`}
      >
        <div className="text-center mb-8">
          {/* Wordmark — full assistant name. Mirrors Harvey's serif
              wordmark pattern; reads as a brand the moment the page
              loads. Sized down from the single-letter version so
              "Vergil" / "Dante" both fit cleanly without crowding
              the input below. */}
          <h1
            className="heading-display text-6xl md:text-7xl text-[var(--ink)] font-bold tracking-tight leading-none"
          >
            {brand.name}
          </h1>
        </div>

        {/* Scope chips — Harvey-style two-affordance row above the
            composer. "Choose Vault project" sets the document context;
            "Set client context" sets the per-contact memory scope. Two
            distinct ideas, two distinct chips. */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <Link
            href="/vault"
            className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
            Choose Vault project
          </Link>
          {contextContact ? (
            <ContextChip
              contact={contextContact}
              onClear={() => setContextContact(null)}
            />
          ) : (
            <button
              onClick={() => setContactPickerOpen(true)}
              className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
            >
              <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
              Set client context
            </button>
          )}
        </div>
      </div>

      {/* Compact context chip in expanded mode — small line above thread */}
      {inExpandedMode && contextContact && (
        <div className="mb-4 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
          <Users className="w-3 h-3" strokeWidth={1.5} />
          <span>Context:</span>
          <span className="text-[var(--ink)] font-medium">
            {contextContact.name || contextContact.email}
          </span>
          <button
            onClick={() => setContextContact(null)}
            className="hover:text-[var(--ink)]"
            title="Clear context"
          >
            <X className="w-3 h-3" strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Input — only inline (in landing) before any messages exist.
          When expanded, the input is pinned to the bottom of the
          viewport via the fixed container at the bottom of this
          component. */}
      {!inExpandedMode && (
        <InputBar
          input={input}
          setInput={setInput}
          onKeyDown={onKeyDown}
          submit={() => submit()}
          streaming={streamState.streaming}
          deepResearch={deepResearch}
          setDeepResearch={setDeepResearch}
          webScrape={webScrape}
          setWebScrape={setWebScrape}
          promptsOpen={promptsOpen}
          setPromptsOpen={setPromptsOpen}
          onCustomize={onCustomize}
          customizing={refining === "customize"}
          textareaRef={textareaRef}
          rows={5}
          assistantName={assistantName}
          onOpenFilesAndSources={() => setContactPickerOpen(true)}
        />
      )}

      {/* Knowledge source pills — Harvey-style chip row. Each chip
          shows an icon + name + a "+" affordance that reads as
          "add this as a source" (currently routes to the surface
          itself; full session-pinning lands as a follow-up). */}
      {!inExpandedMode && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {KNOWLEDGE_SOURCES.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.label}
                href={s.href}
                className="group inline-flex items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--canvas)] pl-3 pr-2 py-1.5 text-[13px] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] hover:border-[var(--rule-strong)] transition"
              >
                <Icon className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                <span>{s.label}</span>
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition">
                  <Plus className="w-3 h-3" strokeWidth={2} />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Threaded messages — wrapped in a glass panel so the answer
          floats above the canvas with subtle separation, matching
          the glass composer below. Padding generous enough that
          MessageView's internal spacing doesn't crowd the rule. */}
      {inExpandedMode && (
        <div className="glass-panel rounded-[16px] px-6 md:px-8 py-7 space-y-8">
          {turns.map((t, i) =>
            t.role === "user" ? (
              <UserMessage key={i} content={t.content} />
            ) : (
              <AssistantMessage
                key={i}
                content={t.content}
                trace={t.trace}
                followups={t.followups}
                citationReport={t.citationReport ?? null}
                grounding={t.grounding ?? null}
                onOpenEditor={(c) => setEditorContent(c)}
                onRewrite={(instruction) => onRewriteLast(instruction)}
                onFollowup={(q) => useFollowup(q)}
                rewriting={refining === "rewrite"}
              />
            ),
          )}

          {/* Live trace (still streaming) */}
          {streamState.streaming && (
            <LiveThinking state={streamState} deep={deepResearch} />
          )}

          {streamState.error && (
            <div className="rounded-[4px] border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">
              {streamState.error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Recommended workflows — Harvey-style 4-card row sourced
          from lib/dante/templates.ts. Each card opens the workflow
          editor pre-populated with the template. Hidden in expanded
          mode (post-first-question) to keep the chat focused. */}
      {!inExpandedMode && (
        <div className="mt-12">
          <div className="flex items-baseline justify-between mb-3 px-1">
            <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
              Recommended workflows
            </div>
            <Link
              href="/dante/workflows"
              className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {RECOMMENDED_WORKFLOWS.map((tpl) => (
              <Link
                key={tpl.slug}
                href={`/dante/workflows?template=${tpl.slug}`}
                className="group block rounded-[8px] border border-[var(--rule)] bg-[var(--canvas)] p-3.5 hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <div className="text-[13px] font-medium text-[var(--ink)] mb-3 line-clamp-2 leading-snug">
                  {tpl.name}
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--ink-subtle)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[var(--ink-muted)]">{tpl.kindLabel}</span>
                    <span>·</span>
                    <span>{tpl.steps} step{(tpl.steps as number) === 1 ? "" : "s"}</span>
                  </span>
                  <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" strokeWidth={2} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* History collapsible — landing only */}
      {!inExpandedMode && (
        <div className="mt-10">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <History className="w-3 h-3" />
            Recent
            {historyOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
          {historyOpen && (
            <div className="mt-3 max-w-[480px] mx-auto">
              {recent.length === 0 ? (
                <div className="text-xs text-[var(--ink-subtle)] text-center">
                  No chats yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {recent.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => router.push(`/dante/chat/${c.id}`)}
                      className="w-full text-left rounded-[4px] px-3 py-2 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition truncate"
                      title={c.title}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pinned input bar in expanded mode — compact, no toolbar */}
      {inExpandedMode && (
        <div className="glass-composer-bg fixed bottom-0 left-0 right-0 pt-6 pb-4 z-30">
          <div className="max-w-[760px] mx-auto px-6 md:px-8">
            <InputBar
              compact
              input={input}
              setInput={setInput}
              onKeyDown={onKeyDown}
              submit={() => submit()}
              streaming={streamState.streaming}
              deepResearch={deepResearch}
              setDeepResearch={setDeepResearch}
              webScrape={webScrape}
              setWebScrape={setWebScrape}
              promptsOpen={promptsOpen}
              setPromptsOpen={setPromptsOpen}
              onCustomize={onCustomize}
              customizing={refining === "customize"}
              textareaRef={textareaRef}
              rows={2}
              assistantName={assistantName}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      {contactPickerOpen && (
        <ContactPicker
          onPick={(c) => {
            setContextContact(c);
            setContactPickerOpen(false);
          }}
          onClose={() => setContactPickerOpen(false)}
        />
      )}
      {editorContent != null && (
        <DraftEditor
          initialContent={editorContent}
          filenameStem={deriveFilenameStem(editorContent)}
          onClose={() => setEditorContent(null)}
        />
      )}
    </div>
  );
}

// ── Input bar ───────────────────────────────────────────────────

interface InputBarProps {
  input: string;
  setInput: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  submit: () => void;
  streaming: boolean;
  deepResearch: boolean;
  setDeepResearch: (v: boolean | ((prev: boolean) => boolean)) => void;
  webScrape: boolean;
  setWebScrape: (v: boolean | ((prev: boolean) => boolean)) => void;
  promptsOpen: boolean;
  setPromptsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  onCustomize: () => void;
  customizing: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  rows: number;
  /** Brand name of the assistant, used in the placeholder. */
  assistantName: string;
  /** Optional handler for the Harvey-style "+ Files and sources"
   *  toolbar button. When omitted, the button is hidden. */
  onOpenFilesAndSources?: () => void;
  /** When true, the toolbar (Prompts/Customize/Deep research) is
   *  hidden and the input shrinks to just textarea + send. Used in
   *  expanded mode where the chat is the focus and toolbar choices
   *  feel like noise. */
  compact?: boolean;
}

function InputBar(p: InputBarProps) {
  // Compact: textarea with the send button overlaid in the bottom-
  // right corner, no divider, no toolbar. Reads as a single unit.
  if (p.compact) {
    return (
      <div className="glass-panel relative rounded-[14px]">
        <textarea
          ref={p.textareaRef}
          value={p.input}
          onChange={(e) => p.setInput(e.target.value)}
          onKeyDown={p.onKeyDown}
          placeholder={`Ask ${p.assistantName} anything…`}
          disabled={p.streaming}
          rows={p.rows}
          className="w-full resize-none bg-transparent pl-5 pr-14 py-4 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none disabled:opacity-60"
        />
        <button
          onClick={p.submit}
          disabled={!p.input.trim() || p.streaming}
          className="absolute bottom-2.5 right-2.5 inline-flex items-center justify-center w-8 h-8 rounded-[6px] bg-black text-white hover:bg-black/85 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Send (Cmd+Enter)"
        >
          {p.streaming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" strokeWidth={2} />
          )}
        </button>
      </div>
    );
  }

  // Full landing input — textarea on top, toolbar tucked into the
  // same container with no divider. Send is icon-only on the right.
  return (
    <div className="glass-panel rounded-[14px]">
      <textarea
        ref={p.textareaRef}
        value={p.input}
        onChange={(e) => p.setInput(e.target.value)}
        onKeyDown={p.onKeyDown}
        placeholder={`Ask ${p.assistantName} anything…`}
        disabled={p.streaming}
        rows={p.rows}
        className="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none disabled:opacity-60"
      />
      <div className="flex items-center justify-between px-3 pb-2 pt-1">
        <div className="flex items-center gap-0.5">
          {/* Lead toolbar affordance — Harvey-style "+ Files and
              sources". For now this opens the same contact picker
              the legacy "Set client context" chip did; a richer
              vault-doc picker is a follow-up. The visual hierarchy
              still reads as "this is where you scope the chat." */}
          {p.onOpenFilesAndSources && (
            <button
              onClick={p.onOpenFilesAndSources}
              disabled={p.streaming}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] hover:bg-[var(--canvas-subtle)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition disabled:opacity-50 mr-1"
            >
              <Plus className="w-3 h-3" strokeWidth={2} />
              Files and sources
            </button>
          )}
          <ToolbarButton
            icon={Library}
            label="Prompts"
            active={p.promptsOpen}
            onClick={() => p.setPromptsOpen((v) => !v)}
          />
          <ToolbarButton
            icon={Sliders}
            label="Customize"
            loading={p.customizing}
            disabled={!p.input.trim() || p.streaming}
            tip="AI-rewrite this prompt to be more specific"
            onClick={p.onCustomize}
          />
          <ToolbarButton
            icon={Telescope}
            label="Deep research"
            active={p.deepResearch}
            tip={
              p.deepResearch
                ? "On — Anthropic Managed Agent does multi-step web research with citations"
                : "Off — switch on for web research with primary-source citations"
            }
            onClick={() => {
              p.setDeepResearch((v) => {
                const next = !v;
                // Mutually exclusive with web scrape — toggling one off
                // the other so the composer never has two modes lit.
                if (next) p.setWebScrape(false);
                return next;
              });
            }}
          />
          {/* Vergil-only — surfaces the Web Scraper agent for "pull
              comps for 412 Beech" style asks. Hidden on Dante because
              there's no advisor use case (custodian portals are
              login-walled). */}
          {p.assistantName === "Vergil" && (
            <ToolbarButton
              icon={Globe}
              label="Pull comps"
              active={p.webScrape}
              tip={
                p.webScrape
                  ? "On — Web Scraper agent (Browser Use Cloud) pulls structured data from the URL or address you describe"
                  : "Off — switch on to scrape comps, listings, or public records from a URL"
              }
              onClick={() => {
                p.setWebScrape((v) => {
                  const next = !v;
                  if (next) p.setDeepResearch(false);
                  return next;
                });
              }}
            />
          )}
        </div>
        <button
          onClick={p.submit}
          disabled={!p.input.trim() || p.streaming}
          className="inline-flex items-center justify-center w-8 h-8 rounded-[6px] bg-black text-white hover:bg-black/85 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Send (Cmd+Enter)"
        >
          {p.streaming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" strokeWidth={2} />
          )}
        </button>
      </div>

      {p.promptsOpen && (
        <div className="border-t border-[var(--rule)]/60 px-3 py-3 bg-[var(--canvas)]/40">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] mb-2">
            Quick prompts
          </div>
          <div className="space-y-1">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                onClick={() => {
                  p.setInput(q.prompt);
                  p.setPromptsOpen(false);
                  p.textareaRef.current?.focus();
                }}
                className="block w-full text-left rounded-[4px] px-2 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Toolbar button ──────────────────────────────────────────────

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  loading,
  tip,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  tip?: string;
  onClick?: () => void;
}) {
  const palette = active
    ? "bg-black text-white"
    : disabled
      ? "text-[var(--ink-muted)] opacity-40"
      : "text-[var(--ink)] hover:bg-[var(--canvas)]/60";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={tip}
      className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-xs transition disabled:cursor-not-allowed ${palette}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      )}
      {label}
    </button>
  );
}

// ── Context chip (landing) ──────────────────────────────────────

function ContextChip({
  contact,
  onClear,
}: {
  contact: Contact;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1 text-xs text-white">
      <Users className="w-3 h-3" strokeWidth={1.5} />
      {contact.name || contact.email || "Unnamed"}
      <button onClick={onClear} className="ml-0.5 hover:opacity-70" title="Clear context">
        <X className="w-3 h-3" strokeWidth={2} />
      </button>
    </span>
  );
}

// ── Contact picker modal ────────────────────────────────────────

function ContactPicker({
  onPick,
  onClose,
}: {
  onPick: (c: Contact) => void;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/contacts");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setContacts(data as Contact[]);
      } catch {
        /* swallow */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? contacts.filter((c) => `${c.name || ""} ${c.email || ""}`.toLowerCase().includes(q))
    : contacts;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--canvas)] border border-[var(--rule)] rounded-[8px] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--rule)] px-3 py-2">
          <Search className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts…"
            className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--ink-muted)]">
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-1.5" />
              Loading contacts…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--ink-muted)]">
              No matching contacts.
            </div>
          ) : (
            filtered.slice(0, 50).map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c)}
                className="block w-full text-left px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--canvas-subtle)] border-b border-[var(--rule)]/40 last:border-0"
              >
                <div className="font-medium">{c.name || "(unnamed)"}</div>
                {c.email && (
                  <div className="text-[11px] text-[var(--ink-muted)]">{c.email}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
