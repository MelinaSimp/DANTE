"use client";

// DraftWithAssistant — inline AI draft helper for any email composer.
// Drops into a compose surface as a small "Draft with <Name>" button;
// click opens a panel with a prompt input, vertical-aware starter
// prompts, and a streaming preview that the user can apply to the
// composer body (or subject + body together).
//
// Routes through /api/dante/ask so the same memory + vault grounding
// the rest of D/V uses is in play here too. If the recipient email
// matches a workspace contact, that contact's id is stamped as
// context — the agent then defaults memory.search and skill.run to
// the right person without the user having to specify.
//
// Usage:
//
//   <DraftWithAssistant
//     toEmail={to}
//     subject={subject}
//     currentBody={body}
//     onApply={(b, s) => { setBody(b); if (s) setSubject(s); }}
//   />

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  Send,
  X,
  ChevronDown,
  Check,
  Wand2,
  PenLine,
} from "lucide-react";
import {
  consumeAgentStream,
  initialStreamState,
  type StreamState,
} from "@/app/dante/streamClient";
import MarkdownRenderer from "@/app/dante/MarkdownRenderer";
import { useAssistantBrand } from "./AssistantNameProvider";
import DraftEditor from "./DraftEditor";

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
}

interface Props {
  toEmail: string;
  subject: string;
  currentBody: string;
  /** Apply the generated body to the composer. Optional second arg
   *  lets the caller also update the subject (when D/V proposes one). */
  onApply: (body: string, subject?: string) => void;
  /** Optional alignment: where the panel anchors. Defaults to below. */
  align?: "below" | "above";
}

export default function DraftWithAssistant({
  toEmail,
  subject,
  currentBody,
  onApply,
}: Props) {
  const { name: assistantName } = useAssistantBrand();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [stream, setStream] = useState<StreamState>(initialStreamState());
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [matchedContact, setMatchedContact] = useState<Contact | null>(null);
  // When the user opts to refine the draft beyond a single revision,
  // we hand off to the full DraftEditor (revision stack + Show Edits).
  const [editorOpen, setEditorOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pull workspace contacts once so we can resolve toEmail → contact_id
  // for context binding. A few hundred rows is well under the budget;
  // this matches the same pattern /api/reminders/draft uses.
  useEffect(() => {
    if (!open || contacts.length > 0) return;
    fetch("/api/contacts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setContacts(Array.isArray(d) ? d : []))
      .catch(() => setContacts([]));
  }, [open, contacts.length]);

  // Resolve the recipient — exact email match wins. If multiple
  // contacts share an email (rare), we take the first.
  useEffect(() => {
    const t = toEmail.trim().toLowerCase();
    if (!t) {
      setMatchedContact(null);
      return;
    }
    const m = contacts.find((c) => (c.email || "").toLowerCase() === t);
    setMatchedContact(m || null);
  }, [toEmail, contacts]);

  // Esc closes; refocus the input on open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Cancel in-flight streams on close.
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [open]);

  const run = useCallback(
    async (userPrompt: string) => {
      const p = userPrompt.trim();
      if (!p || stream.streaming) return;

      // Compose the agent message. We bundle the current draft +
      // subject + recipient as "ground truth" so D/V either polishes
      // what's already there or drafts from scratch coherently.
      const lines: string[] = [];
      if (toEmail.trim()) lines.push(`Recipient email: ${toEmail.trim()}`);
      if (matchedContact?.name)
        lines.push(`Recipient name: ${matchedContact.name}`);
      if (subject.trim()) lines.push(`Current subject: ${subject.trim()}`);
      if (currentBody.trim())
        lines.push(`Current draft:\n${currentBody.trim()}`);
      lines.push("");
      lines.push(
        "Output JUST the email body, ready to paste into the composer. " +
          "No preamble like 'Here's a draft:'. " +
          "If you want to propose a new subject line, prefix it on its own line as `Subject: <line>` before the body — otherwise omit the subject and only return the body. " +
          "Plain text or light markdown only; the composer renders newlines as paragraph breaks. " +
          "Do NOT include citation markers like [v1] or [mem:abc12345] in the body — this output goes directly into an outgoing email, where those internal references would be confusing to the recipient.",
      );
      lines.push("");
      lines.push(`Request: ${p}`);
      const message = lines.join("\n");

      setStream({ ...initialStreamState(), streaming: true });
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await consumeAgentStream({
          body: {
            message,
            context_contact_id: matchedContact?.id || undefined,
            context_contact_name: matchedContact?.name || undefined,
          },
          signal: controller.signal,
          onUpdate: (s) => setStream(s),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "request failed";
        setStream((s) => ({ ...s, streaming: false, error: msg }));
      }
    },
    [stream.streaming, toEmail, subject, currentBody, matchedContact],
  );

  // Parse out an optional `Subject: …` first line. Keeps the rest as
  // the body. If no subject line, the whole thing is the body.
  const parseDraft = (text: string): { subject: string | null; body: string } => {
    const trimmed = text.trim();
    const m = trimmed.match(/^Subject:\s*(.+?)\n+([\s\S]*)$/i);
    if (m) return { subject: m[1].trim(), body: m[2].trim() };
    return { subject: null, body: trimmed };
  };

  // Strip internal citation markers ([v1], [mem:abc12345]) before
  // pasting into the composer. The system prompt forbids them, but
  // some models slip them in anyway — defensive scrub keeps the
  // recipient from seeing internal vault references.
  const stripCitations = (text: string): string => {
    return text
      .replace(/\[v\d+\]/g, "")
      .replace(/\[mem:[a-f0-9]+\]/g, "")
      // Collapse double spaces left behind by the strip.
      .replace(/[ \t]{2,}/g, " ")
      // Tidy " ." → "." artefacts.
      .replace(/\s+([.,;:!?])/g, "$1")
      .trim();
  };

  const apply = (mode: "replace" | "append") => {
    const out = parseDraft(stream.finalContent);
    const cleanBody = stripCitations(out.body);
    if (!cleanBody) return;
    if (mode === "append") {
      const sep = currentBody.trim() ? "\n\n" : "";
      onApply(currentBody + sep + cleanBody, out.subject || undefined);
    } else {
      onApply(cleanBody, out.subject || undefined);
    }
    setStream(initialStreamState());
    setPrompt("");
    setOpen(false);
  };

  // Vertical-aware starter prompts. We deliberately keep these short
  // and verb-led so they read well as buttons.
  const STARTERS = [
    "Quick reply acknowledging receipt",
    matchedContact
      ? `Recap our last conversation with ${matchedContact.name?.split(" ")[0] || "them"} and propose next steps`
      : "Recap our last conversation and propose next steps",
    "Polish this draft — keep my voice but tighten it",
    "Make it warmer / more personal",
    "Make it shorter — half the length, same key facts",
  ];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
        title={`Draft with ${assistantName}`}
      >
        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
        Draft with {assistantName}
      </button>
    );
  }

  const showThinking = stream.streaming && !stream.finalContent;
  const hasDraft = stream.finalContent.trim().length > 0;

  return (
    <div className="border border-[var(--rule)] rounded-[6px] bg-[var(--canvas-subtle)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--rule)]">
        <div className="flex items-center gap-2 min-w-0">
          <Wand2 className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <div className="text-xs font-medium text-[var(--ink)]">
            Draft with {assistantName}
          </div>
          {matchedContact && (
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] truncate">
              · {matchedContact.name || matchedContact.email}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1 rounded text-[var(--ink-muted)] hover:bg-[var(--canvas)] transition"
          title="Close"
        >
          <X className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-3 py-3 space-y-3">
        {/* Prompt input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(prompt);
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
                run(prompt);
              }
            }}
            rows={2}
            placeholder={
              currentBody.trim()
                ? "Tell D/V how to revise this draft, or describe what you want to write…".replace(
                    "D/V",
                    assistantName,
                  )
                : `Tell ${assistantName} what email to draft…`
            }
            className="flex-1 resize-none rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || stream.streaming}
            className="inline-flex items-center justify-center w-8 h-8 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 transition"
            title="Generate"
          >
            {stream.streaming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
          </button>
        </form>

        {/* Starter chips — only show before the user has run a turn,
            to avoid cluttering once a draft preview is in view. */}
        {!hasDraft && !stream.streaming && (
          <div className="flex flex-wrap gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => run(s)}
                className="px-2.5 py-1 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas)] text-[11px] text-[var(--ink)] text-left transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Live status / preview */}
        {(stream.streaming || hasDraft || stream.error) && (
          <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] p-3 min-h-[80px]">
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
                        return last.summary || `Drafting (step ${last.iteration})…`;
                      return "Drafting…";
                    })()}
                  </span>
                ) : (
                  <span>Drafting…</span>
                )}
              </div>
            ) : null}

            {stream.error && (
              <div className="text-xs text-[var(--danger)]">{stream.error}</div>
            )}

            {hasDraft &&
              (() => {
                const parsed = parseDraft(stream.finalContent);
                return (
                  <div className="space-y-2">
                    {parsed.subject && (
                      <div className="text-xs">
                        <span className="mono uppercase tracking-wider text-[var(--ink-subtle)] mr-2">
                          Subject:
                        </span>
                        <span className="text-[var(--ink)]">
                          {parsed.subject}
                        </span>
                      </div>
                    )}
                    <div className="text-sm text-[var(--ink)] leading-relaxed">
                      <MarkdownRenderer
                        content={parsed.body}
                        trace={stream.trace}
                      />
                    </div>
                  </div>
                );
              })()}
          </div>
        )}

        {/* Apply controls — appear once a draft is ready. */}
        {hasDraft && !stream.streaming && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => apply("replace")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-semibold hover:opacity-90 transition"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
              {currentBody.trim() ? "Replace draft" : "Use this"}
            </button>
            {currentBody.trim() && (
              <button
                type="button"
                onClick={() => apply("append")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas)] text-xs font-medium text-[var(--ink)] transition"
              >
                <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                Append
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas)] text-xs font-medium text-[var(--ink)] transition"
              title="Open in revision-tracking editor"
            >
              <PenLine className="w-3.5 h-3.5" strokeWidth={1.5} />
              Refine in editor
            </button>
            <button
              type="button"
              onClick={() => {
                setStream(initialStreamState());
                setPrompt("");
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Full revision-tracking editor — opens on demand, hands the
          finalised content back to the composer when the user
          clicks Apply. */}
      {editorOpen && (
        <DraftEditor
          initialContent={
            (() => {
              const out = parseDraft(stream.finalContent);
              return out.body;
            })()
          }
          filenameStem={
            matchedContact?.name
              ? `draft-${matchedContact.name.toLowerCase().replace(/\s+/g, "-")}`
              : "draft"
          }
          contextContactId={matchedContact?.id}
          contextContactName={matchedContact?.name || undefined}
          onApply={(content) => {
            const cleaned = stripCitations(content);
            const parsed = parseDraft(stream.finalContent);
            onApply(cleaned, parsed.subject || undefined);
            setStream(initialStreamState());
            setPrompt("");
            setOpen(false);
            setEditorOpen(false);
          }}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
