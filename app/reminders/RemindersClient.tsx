"use client";

// RemindersClient — three tabs: Drafts (review + edit + approve),
// Scheduled (sent later), Sent (sent or failed). Includes an inline
// "Ask Vergil" prompt that turns a free-text request into a draft
// via /api/reminders/draft.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Loader2,
  Sparkles,
  Send,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";

interface Reminder {
  id: string;
  source: "auto" | "user";
  contact_id: string | null;
  property_id: string | null;
  appointment_id: string | null;
  channel: string;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  send_at: string | null;
  status: "draft" | "scheduled" | "sent" | "cancelled" | "failed";
  sent_at: string | null;
  send_error: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

const TABS = [
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sent", label: "Sent" },
] as const;

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function fmtForInput(iso: string | null) {
  if (!iso) return "";
  // datetime-local needs YYYY-MM-DDTHH:MM in local time
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function RemindersClient() {
  const [tab, setTab] = useState<"draft" | "scheduled" | "sent">("draft");
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline Vergil-ask
  const [askOpen, setAskOpen] = useState(false);
  const [askPrompt, setAskPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);

  const load = (forTab: "draft" | "scheduled" | "sent") => {
    setItems(null);
    setError(null);
    // For 'sent' tab, also include 'failed' visually so the user can fix.
    fetch(`/api/reminders?status=${forTab}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed");
        return r.json();
      })
      .then((d) => {
        if (forTab === "sent") {
          // Pull failed too in a second fetch and merge.
          fetch(`/api/reminders?status=failed`, { credentials: "include" })
            .then((r) => (r.ok ? r.json() : []))
            .then((failed) => {
              setItems([...(Array.isArray(d) ? d : []), ...(Array.isArray(failed) ? failed : [])]);
            });
        } else {
          setItems(Array.isArray(d) ? d : []);
        }
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load(tab);
  }, [tab]);

  const submitAsk = async () => {
    if (!askPrompt.trim()) return;
    setDrafting(true);
    setError(null);
    try {
      const r = await fetch("/api/reminders/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: askPrompt.trim() }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Draft failed");
      const created = await r.json();
      setAskPrompt("");
      setAskOpen(false);
      setEditing(created);
      if (tab !== "draft") setTab("draft");
      else load("draft");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDrafting(false);
    }
  };

  const saveEdits = async () => {
    if (!editing) return;
    const r = await fetch(`/api/reminders/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        to_email: editing.to_email,
        subject: editing.subject,
        body: editing.body,
        send_at: editing.send_at,
      }),
    });
    if (!r.ok) {
      setError((await r.json()).error || "Save failed");
      return;
    }
    const updated = await r.json();
    setEditing(updated);
    load(tab);
  };

  const approve = async () => {
    if (!editing) return;
    const r = await fetch(`/api/reminders/${editing.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ send_at: editing.send_at }),
    });
    if (!r.ok) {
      setError((await r.json()).error || "Approve failed");
      return;
    }
    setEditing(null);
    setTab("scheduled");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this reminder?")) return;
    const r = await fetch(`/api/reminders/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) {
      setEditing(null);
      load(tab);
    }
  };

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Reminders</span>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="flex items-baseline justify-between mb-8 gap-6 flex-wrap">
          <div>
            <div className="label-section mb-1">Drafts you'll review</div>
            <h1 className="heading-display text-4xl text-[var(--ink)]">Reminders</h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-xl">
              Auto-suggested from your calendar and explicitly asked-for
              follow-ups. Every reminder is a draft until you approve it —
              nothing sends without your say-so.
            </p>
          </div>
          <button
            onClick={() => setAskOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
          >
            <Sparkles className="w-4 h-4" strokeWidth={1.5} />
            Ask Vergil
          </button>
        </div>

        {askOpen && (
          <section className="card-flat p-5 mb-8">
            <div className="label-section mb-2">Draft a reminder</div>
            <textarea
              value={askPrompt}
              onChange={(e) => setAskPrompt(e.target.value)}
              rows={2}
              placeholder='e.g. "Remind me to follow up with Smith next Tuesday at 2pm about the closing docs."'
              className={`${inputClass} resize-y`}
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={submitAsk}
                disabled={drafting || !askPrompt.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
              >
                {drafting ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                )}
                {drafting ? "Drafting…" : "Generate draft"}
              </button>
              <span className="text-[11px] text-[var(--ink-subtle)]">
                You'll review the draft before anything goes out.
              </span>
            </div>
          </section>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 p-0.5 mb-6 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] w-fit">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className="px-3 py-1.5 rounded-[4px] text-xs font-medium transition"
              style={{
                background: tab === t.value ? "var(--canvas)" : "transparent",
                color: tab === t.value ? "var(--ink)" : "var(--ink-muted)",
                boxShadow: tab === t.value ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {items === null ? (
          <div className="flex items-center justify-center py-24">
            <Loader2
              className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="card-flat py-16 text-center">
            <Bell
              className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1.5}
            />
            <p className="text-sm text-[var(--ink-muted)]">
              {tab === "draft"
                ? "No drafts. Ask Vergil or wait for the daily auto-scan."
                : tab === "scheduled"
                ? "Nothing scheduled."
                : "Nothing sent yet."}
            </p>
          </div>
        ) : (
          <div className="card-flat overflow-hidden">
            <ul className="divide-y divide-[var(--rule)]">
              {items.map((r) => (
                <li
                  key={r.id}
                  onClick={() => setEditing(r)}
                  className="py-4 px-6 flex items-center gap-4 hover:bg-[var(--canvas-subtle)] transition cursor-pointer"
                >
                  <div className="shrink-0">
                    {r.status === "sent" ? (
                      <CheckCircle2
                        className="w-4 h-4 text-[var(--verified)]"
                        strokeWidth={1.5}
                      />
                    ) : r.status === "failed" ? (
                      <AlertCircle
                        className="w-4 h-4 text-[var(--danger)]"
                        strokeWidth={1.5}
                      />
                    ) : r.status === "scheduled" ? (
                      <Clock
                        className="w-4 h-4 text-[var(--accent)]"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <Bell
                        className="w-4 h-4 text-[var(--ink-muted)]"
                        strokeWidth={1.5}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--ink)] truncate">
                        {r.subject || "(no subject)"}
                      </span>
                      <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                        {r.source}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--ink-subtle)] truncate mt-0.5">
                      To {r.to_email || "—"} · {fmtDateTime(r.send_at)}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </div>
                    {r.send_error && (
                      <div className="text-[11px] text-[var(--danger)] mt-0.5 truncate">
                        {r.send_error}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Edit drawer */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/30 backdrop-blur-sm px-4 py-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell
                  className="w-4 h-4 text-[var(--ink-muted)]"
                  strokeWidth={1.5}
                />
                <h3 className="text-sm font-semibold text-[var(--ink)]">
                  {editing.status === "draft"
                    ? "Review & approve"
                    : editing.status === "scheduled"
                    ? "Scheduled"
                    : editing.status === "sent"
                    ? "Sent"
                    : "Reminder"}
                </h3>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {editing.reason && (
                <div className="text-[11px] text-[var(--ink-subtle)] italic">
                  {editing.reason}
                </div>
              )}
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  To
                </div>
                <input
                  value={editing.to_email || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, to_email: e.target.value })
                  }
                  disabled={editing.status !== "draft"}
                  type="email"
                  className={`${inputClass} disabled:opacity-60`}
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Subject
                </div>
                <input
                  value={editing.subject || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, subject: e.target.value })
                  }
                  disabled={editing.status !== "draft"}
                  className={`${inputClass} disabled:opacity-60`}
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Body
                </div>
                <textarea
                  value={editing.body || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, body: e.target.value })
                  }
                  disabled={editing.status !== "draft"}
                  rows={10}
                  className={`${inputClass} disabled:opacity-60 resize-y`}
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Send at
                </div>
                <input
                  type="datetime-local"
                  value={fmtForInput(editing.send_at)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      send_at: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                  disabled={editing.status !== "draft"}
                  className={`${inputClass} disabled:opacity-60`}
                />
              </label>
              {editing.send_error && (
                <div className="px-3 py-2 text-xs text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px]">
                  Send error: {editing.send_error}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--rule)] flex items-center gap-3 flex-wrap">
              {editing.status === "draft" && (
                <>
                  <button
                    onClick={approve}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
                  >
                    <Send className="w-4 h-4" strokeWidth={1.5} />
                    Approve & schedule
                  </button>
                  <button
                    onClick={saveEdits}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
                  >
                    Save edits
                  </button>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => remove(editing.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--danger)] hover:bg-[var(--danger-soft)] text-xs font-medium transition"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
