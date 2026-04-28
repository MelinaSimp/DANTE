"use client";

// ComposeDrawer — slide-in side drawer for sending an email without
// leaving the Inbox. Posts to the existing /api/emails/send route, so
// rate-limit + usage-tracking that the standalone /email composer
// already enforces are inherited automatically.
//
// Intentionally slim: To / Subject / Body / Send. The full /email
// composer (with templates, recent-sent log, LLM rewrite) is still
// reachable directly at /email for power use; this drawer is the
// "fire off a quick reply" path.

import { useEffect, useState } from "react";
import {
  X,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import DraftWithAssistant from "@/components/dante/DraftWithAssistant";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional prefill (e.g. "Reply" off an inbox item — wire later). */
  defaultTo?: string;
  defaultSubject?: string;
}

export default function ComposeDrawer({
  open,
  onClose,
  defaultTo = "",
  defaultSubject = "",
}: Props) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-prefill when the parent opens us with new defaults (e.g. the
  // user clicked "Reply" on a different message after sending one).
  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody("");
      setSentAt(null);
      setError(null);
    }
  }, [open, defaultTo, defaultSubject]);

  // Esc closes — matches Gmail/Front muscle memory.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = async () => {
    setError(null);
    if (!to.trim()) return setError("Recipient required");
    if (!subject.trim()) return setError("Subject required");
    if (!body.trim()) return setError("Body required");
    setSending(true);
    try {
      // Plain text body wrapped minimally for HTML — Resend wants
      // htmlContent, but the user is typing plain text so we
      // preserve newlines without forcing them to learn HTML.
      const html = body
        .split(/\n\n+/)
        .map(
          (para) =>
            `<p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a">${para
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/\n/g, "<br/>")}</p>`
        )
        .join("");
      const r = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          htmlContent: html,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Send failed");
      }
      setSentAt(Date.now());
      // Auto-close after a beat so the user sees confirmation
      // without it lingering forever.
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (e: any) {
      setError(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-[var(--ink)]/20 backdrop-blur-[2px] transition-opacity"
      />
      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-xl bg-[var(--canvas)] border-l border-[var(--rule)] shadow-2xl flex flex-col"
        role="dialog"
        aria-label="Compose email"
      >
        <div className="px-5 py-4 border-b border-[var(--rule)] flex items-center justify-between">
          <div>
            <div className="label-section mb-0.5">New message</div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Compose</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <label className="block">
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
              To
            </div>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className={inputClass}
              autoFocus
            />
          </label>
          <label className="block">
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
              Subject
            </div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className={inputClass}
            />
          </label>
          <div className="flex items-center justify-between">
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
              Message
            </div>
            <DraftWithAssistant
              toEmail={to}
              subject={subject}
              currentBody={body}
              onApply={(b, s) => {
                setBody(b);
                if (s) setSubject(s);
              }}
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={14}
            className={`${inputClass} resize-y leading-relaxed`}
          />
          {error && (
            <div className="px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
              {error}
            </div>
          )}
          {sentAt && !error && (
            <div className="px-3 py-2 text-sm text-[var(--verified)] bg-[var(--verified-soft)] border border-[var(--verified)]/30 rounded-[4px] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
              Sent
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[var(--rule)] flex items-center gap-3">
          <button
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Send className="w-4 h-4" strokeWidth={1.5} />
            )}
            {sending ? "Sending…" : "Send"}
          </button>
          <span className="text-[11px] text-[var(--ink-subtle)]">
            Press Esc to close. Need templates / LLM rewrite? Use{" "}
            <a href="/email" className="underline underline-offset-2">
              full composer
            </a>
            .
          </span>
        </div>
      </aside>
    </>
  );
}
