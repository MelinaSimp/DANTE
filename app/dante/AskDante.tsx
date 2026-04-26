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
import {
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Library,
  Sliders,
  Wand2,
  Telescope,
  Database,
  BookOpen,
  Users,
  CalendarDays,
  History,
  FileText,
  X,
  Search,
  Copy,
  Download,
  ThumbsUp,
  ThumbsDown,
  Check,
  ArrowRight,
} from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import DocumentPanel, { looksLikeDraft, deriveFilenameStem } from "./DocumentPanel";
import {
  consumeAgentStream,
  type StreamState,
  initialStreamState,
} from "./streamClient";
import { buildCitationMap } from "@/lib/dante/citations";

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

const KNOWLEDGE_SOURCES = [
  { label: "Memory", icon: Database },
  { label: "Vault", icon: BookOpen },
  { label: "Contacts", icon: Users },
  { label: "Calendar", icon: CalendarDays },
] as const;

const REWRITE_PRESETS = [
  { label: "Shorter", instruction: "Make it shorter — half the length, same key facts." },
  { label: "Bullets", instruction: "Rewrite as a bulleted list." },
  { label: "More formal", instruction: "Rewrite in a more formal, client-facing tone." },
  { label: "Add example", instruction: "Add a concrete example illustrating the main point." },
] as const;

// ── Component ────────────────────────────────────────────────────

export default function AskDante() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState());
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
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
      await consumeAgentStream({
        body: {
          message,
          deep: deepResearch,
          context_contact_id: contextContact?.id,
          context_contact_name: contextContact?.name || undefined,
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
      {/* Landing — wordmark + source pills only when no messages yet */}
      {!inExpandedMode && (
        <>
          <div className="text-center mb-8">
            <h1 className="heading-display text-7xl md:text-8xl text-[var(--ink)] font-bold tracking-tight leading-none">
              D
            </h1>
          </div>

          <div className="flex items-center justify-center gap-3 mb-3">
            {contextContact ? (
              <ContextChip
                contact={contextContact}
                onClear={() => setContextContact(null)}
              />
            ) : (
              <button
                onClick={() => setContactPickerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule)] px-3 py-1 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
              >
                <Users className="w-3 h-3" strokeWidth={1.5} />
                Set client context
              </button>
            )}
          </div>
        </>
      )}

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
          promptsOpen={promptsOpen}
          setPromptsOpen={setPromptsOpen}
          onCustomize={onCustomize}
          customizing={refining === "customize"}
          textareaRef={textareaRef}
          rows={4}
        />
      )}

      {/* Knowledge source pills — landing only */}
      {!inExpandedMode && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {KNOWLEDGE_SOURCES.map((s) => {
            const Icon = s.icon;
            return (
              <span
                key={s.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule)] bg-[var(--canvas)] px-3 py-1.5 text-xs text-[var(--ink)]"
              >
                <Icon className="w-3 h-3" strokeWidth={1.5} />
                {s.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Threaded messages */}
      {inExpandedMode && (
        <div className="space-y-8">
          {turns.map((t, i) =>
            t.role === "user" ? (
              <UserMessage key={i} content={t.content} />
            ) : (
              <AssistantMessage
                key={i}
                content={t.content}
                trace={t.trace}
                followups={t.followups}
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

      {/* History collapsible — landing only */}
      {!inExpandedMode && (
        <div className="mt-12">
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

      {/* Pinned input bar in expanded mode */}
      {inExpandedMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--canvas)] via-[var(--canvas)] to-transparent pt-6 pb-4 z-30">
          <div className="max-w-[760px] mx-auto px-6 md:px-8">
            <InputBar
              input={input}
              setInput={setInput}
              onKeyDown={onKeyDown}
              submit={() => submit()}
              streaming={streamState.streaming}
              deepResearch={deepResearch}
              setDeepResearch={setDeepResearch}
              promptsOpen={promptsOpen}
              setPromptsOpen={setPromptsOpen}
              onCustomize={onCustomize}
              customizing={refining === "customize"}
              textareaRef={textareaRef}
              rows={2}
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
        <DocumentPanel
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
  promptsOpen: boolean;
  setPromptsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  onCustomize: () => void;
  customizing: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  rows: number;
}

function InputBar(p: InputBarProps) {
  return (
    <div className="rounded-[12px] border border-[var(--rule)] bg-[var(--canvas-subtle)] shadow-sm">
      <textarea
        ref={p.textareaRef}
        value={p.input}
        onChange={(e) => p.setInput(e.target.value)}
        onKeyDown={p.onKeyDown}
        placeholder="Ask Dante anything…"
        disabled={p.streaming}
        rows={p.rows}
        className="w-full resize-none bg-transparent px-5 py-4 text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none disabled:opacity-60"
      />
      <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--rule)]/60">
        <div className="flex items-center gap-0.5">
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
        </div>
        <div className="flex items-center gap-2">
          <ToolbarButton
            icon={Telescope}
            label="Deep research"
            active={p.deepResearch}
            tip={
              p.deepResearch
                ? "On — agent will iterate (up to 20 steps)"
                : "Off — switch on for thorough multi-step research"
            }
            onClick={() => p.setDeepResearch((v) => !v)}
          />
          <button
            onClick={p.submit}
            disabled={!p.input.trim() || p.streaming}
            className="inline-flex items-center gap-1.5 rounded-[6px] bg-black px-3 py-1.5 text-sm text-white hover:bg-black/85 disabled:opacity-40 font-medium"
          >
            {p.streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {p.streaming ? "Thinking…" : "Ask Dante"}
          </button>
        </div>
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

// ── Live thinking trace ─────────────────────────────────────────
// Harvey-style checklist. Each iteration_thinking event becomes a row;
// per-tool events collapse into the iteration above them as small
// detail rows (only when present).

function LiveThinking({ state, deep }: { state: StreamState; deep: boolean }) {
  // Group events by iteration — a phase consists of one
  // iteration_thinking event followed by N tool events until the
  // next iteration_thinking.
  type Phase = {
    iteration: number;
    summary: string;
    tools: Array<{ name: string; status?: "pending" | "success" | "error" }>;
  };
  const phases: Phase[] = [];
  let active: Phase | null = null;

  for (const ev of state.events) {
    if (ev.type === "iteration_thinking") {
      active = {
        iteration: ev.iteration,
        summary: ev.summary || "Thinking…",
        tools: [],
      };
      phases.push(active);
    } else if (ev.type === "tool_start") {
      // tool_start that happens before any iteration_thinking (rare,
      // shouldn't occur with the new system prompt but keep robust).
      if (!active) {
        active = { iteration: -1, summary: "Working…", tools: [] };
        phases.push(active);
      }
      active.tools.push({ name: ev.tool_name, status: "pending" });
    } else if (ev.type === "tool_end") {
      if (!active) continue;
      const last = [...active.tools].reverse().find((t) => t.name === ev.tool_name && t.status === "pending");
      if (last) last.status = ev.status;
      else active.tools.push({ name: ev.tool_name, status: ev.status });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Working…
        {deep && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-[10px] text-[var(--ink)]">
            <Telescope className="w-2.5 h-2.5" />
            Deep
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {phases.map((phase, i) => {
          const allDone = phase.tools.length > 0 && phase.tools.every((t) => t.status && t.status !== "pending");
          const isLast = i === phases.length - 1;
          const ticked = !isLast || allDone;
          return (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span
                className={
                  ticked
                    ? "text-emerald-600 dark:text-emerald-400 mt-0.5"
                    : "text-[var(--ink-subtle)] mt-0.5"
                }
                aria-hidden
              >
                {ticked ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : "○"}
              </span>
              <span className="text-[var(--ink)] flex-1">{phase.summary}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── User message ────────────────────────────────────────────────

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-1.5 mt-0.5">
        <Users className="w-3 h-3 text-[var(--ink-muted)]" strokeWidth={1.5} />
      </div>
      <div className="flex-1 text-[var(--ink)] whitespace-pre-wrap text-sm leading-relaxed">
        {content}
      </div>
    </div>
  );
}

// ── Assistant message ───────────────────────────────────────────
// No card wrapper, no avatar. Plain prose like Harvey's answer.
// Action bar + Sources + Follow-ups underneath.

function AssistantMessage({
  content,
  trace,
  followups,
  onOpenEditor,
  onRewrite,
  onFollowup,
  rewriting,
}: {
  content: string;
  trace: unknown;
  followups: string[];
  onOpenEditor: (content: string) => void;
  onRewrite: (instruction: string) => void;
  onFollowup: (q: string) => void;
  rewriting: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const isDraft = looksLikeDraft(content);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const onExport = () => {
    const stem = deriveFilenameStem(content).replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stem}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Body — clean prose, no bubble */}
      <div className="text-[var(--ink)]">
        <MarkdownRenderer content={content} trace={trace} />
      </div>

      {/* Action bar */}
      <div className="mt-4 flex items-center gap-3 text-xs text-[var(--ink-muted)]">
        <button onClick={onCopy} className="inline-flex items-center gap-1 hover:text-[var(--ink)]">
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={onExport} className="inline-flex items-center gap-1 hover:text-[var(--ink)]">
          <Download className="w-3 h-3" />
          Export
        </button>
        <div className="relative">
          <button
            onClick={() => setRewriteOpen((v) => !v)}
            disabled={rewriting}
            className="inline-flex items-center gap-1 hover:text-[var(--ink)] disabled:opacity-50"
          >
            {rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            Rewrite
            <ChevronDown className="w-3 h-3" />
          </button>
          {rewriteOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] shadow-lg p-1 min-w-[160px]">
              {REWRITE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    onRewrite(p.instruction);
                    setRewriteOpen(false);
                  }}
                  className="block w-full text-left rounded-[3px] px-2 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {isDraft && (
          <button
            onClick={() => onOpenEditor(content)}
            className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
          >
            <FileText className="w-3 h-3" />
            Open in editor
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setFeedback(feedback === "up" ? null : "up")}
            className={`hover:text-[var(--ink)] ${feedback === "up" ? "text-[var(--ink)]" : ""}`}
            title="Helpful"
          >
            <ThumbsUp className="w-3 h-3" />
          </button>
          <button
            onClick={() => setFeedback(feedback === "down" ? null : "down")}
            className={`hover:text-[var(--ink)] ${feedback === "down" ? "text-[var(--ink)]" : ""}`}
            title="Not helpful"
          >
            <ThumbsDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Sources block */}
      <SourcesBlock trace={trace} />

      {/* Follow-ups */}
      {followups.length > 0 && (
        <div className="mt-6 pt-4 border-t border-[var(--rule)]">
          <div className="text-xs text-[var(--ink-muted)] mb-2">Follow-ups</div>
          <div className="space-y-1">
            {followups.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowup(q)}
                className="w-full text-left flex items-start gap-2 px-2 py-1.5 -mx-2 rounded-[4px] text-sm text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <ArrowRight className="w-3.5 h-3.5 mt-1 text-[var(--ink-muted)] flex-shrink-0" strokeWidth={1.5} />
                <span>{q}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sources block ───────────────────────────────────────────────
// Aggregates citation entries from the trace into a single grouped
// summary at the bottom of each assistant message. Click to expand.

function SourcesBlock({ trace }: { trace: unknown }) {
  const [open, setOpen] = useState(false);
  const map = buildCitationMap(
    Array.isArray(trace) ? (trace as Parameters<typeof buildCitationMap>[0]) : [],
  );
  const vault = Object.values(map.vault);
  const memory = Object.values(map.memory);
  const total = vault.length + memory.length;
  if (total === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <BookOpen className="w-3 h-3" strokeWidth={1.5} />
        Sources · {total}
      </button>
      {open && (
        <div className="mt-2 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-3 space-y-3">
          {vault.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] mb-1.5">
                Vault · {vault.length}
              </div>
              <div className="space-y-1">
                {vault.map((c, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-mono text-amber-700 dark:text-amber-300/90 mr-2">
                      {c.marker}
                    </span>
                    <span className="text-[var(--ink)] font-medium">{c.source}</span>
                    {c.page != null && (
                      <span className="text-[var(--ink-muted)]"> · p.{c.page}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {memory.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] mb-1.5">
                Memory · {memory.length}
              </div>
              <div className="space-y-1">
                {memory.map((c, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-mono text-cyan-700 dark:text-cyan-300/90 mr-2">
                      [mem:{c.short_id}]
                    </span>
                    <span className="text-[var(--ink-muted)]">{c.kind}</span>
                    {c.source_kind && (
                      <span className="text-[var(--ink-subtle)]"> · {c.source_kind}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
