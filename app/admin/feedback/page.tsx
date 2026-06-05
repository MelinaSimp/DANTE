"use client";

// Admin feedback triage page.
//
// Shows chat feedback items (up/down votes) from all workspaces.
// Superadmin can promote downvotes into eval cases or dismiss them.
// The triage API at /api/admin/feedback/triage is workspace-scoped,
// but we also expose a superadmin-level view here that reads across
// all workspaces via the admin evals API pattern.

import { useEffect, useState } from "react";
import {
  MessageSquareWarning,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Clock,
  Send,
} from "lucide-react";
import { reportError } from "@/lib/report-error";

/* ── Types ─────────────────────────────────────────────────────── */

interface FeedbackItem {
  id: string;
  vote: "up" | "down";
  user_input: string;
  agent_output: string;
  comment: string | null;
  triage_status: "pending" | "promoted" | "dismissed";
  promoted_to_eval_id: string | null;
  created_at: string;
  triaged_at: string | null;
  triaged_by: string | null;
  workspace_name?: string;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

/* ── Main Page ─────────────────────────────────────────────────── */

type StatusFilter = "pending" | "promoted" | "dismissed" | "all";

export default function FeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [triaging, setTriaging] = useState<string | null>(null);
  const [evalIdDraft, setEvalIdDraft] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadItems = async () => {
    setLoading(true);
    try {
      // Use the superadmin evals endpoint to get cross-workspace feedback
      const url =
        filter === "all"
          ? "/api/admin/feedback/triage?status=pending"
          : `/api/admin/feedback/triage?status=${filter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      reportError("admin/feedback: load")(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [filter]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleTriage = async (feedbackId: string, action: "promote" | "dismiss") => {
    if (action === "promote" && !evalIdDraft.trim()) {
      setToast({ type: "error", message: "Enter an eval ID / slug to promote to" });
      return;
    }
    setTriaging(feedbackId);
    try {
      const res = await fetch("/api/admin/feedback/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          feedback_id: feedbackId,
          action,
          eval_id: action === "promote" ? evalIdDraft.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setToast({ type: "error", message: data.error || "Triage failed" });
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== feedbackId));
      setToast({
        type: "success",
        message: action === "promote" ? "Promoted to eval case" : "Dismissed",
      });
      setEvalIdDraft("");
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(feedbackId);
        return next;
      });
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setTriaging(null);
    }
  };

  // ── Stats ───────────────────────────────────────────────────
  const downvotes = items.filter((i) => i.vote === "down").length;
  const upvotes = items.filter((i) => i.vote === "up").length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-[6px] text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-[var(--verified-soft)] text-[var(--verified)]"
              : "bg-[var(--danger-soft)] text-[var(--danger)]"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <MessageSquareWarning className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.5} />
        <h1 className="heading-display text-lg">Chat Feedback Triage</h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card-flat p-4">
          <div className="label-section mb-1">Items</div>
          <div className="text-2xl font-semibold text-[var(--ink)]">{items.length}</div>
          <div className="text-xs text-[var(--ink-muted)] mt-1">
            {filter === "all" ? "All statuses" : filter}
          </div>
        </div>
        <div className="card-flat p-4">
          <div className="label-section mb-1">Downvotes</div>
          <div className="text-2xl font-semibold text-[var(--danger)]">{downvotes}</div>
          <div className="text-xs text-[var(--ink-muted)] mt-1">Negative signals</div>
        </div>
        <div className="card-flat p-4">
          <div className="label-section mb-1">Upvotes</div>
          <div className="text-2xl font-semibold text-[var(--verified)]">{upvotes}</div>
          <div className="text-xs text-[var(--ink-muted)] mt-1">Positive signals</div>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 mb-4 border-b border-[var(--rule)]">
        {(
          [
            { key: "pending" as StatusFilter, label: "Pending" },
            { key: "promoted" as StatusFilter, label: "Promoted" },
            { key: "dismissed" as StatusFilter, label: "Dismissed" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              filter === t.key
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--ink-muted)]" />
        </div>
      )}

      {/* Items */}
      {!loading && items.length === 0 && (
        <div className="card-flat p-8 text-center text-sm text-[var(--ink-muted)]">
          No {filter} feedback items.
        </div>
      )}

      {!loading && (
        <div className="space-y-2">
          {items.map((item) => {
            const isExpanded = expanded.has(item.id);
            const isBusy = triaging === item.id;
            return (
              <div key={item.id} className="card-flat">
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--canvas-subtle)] transition rounded-[6px]"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[var(--ink-muted)] shrink-0" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[var(--ink-muted)] shrink-0" strokeWidth={1.5} />
                  )}
                  {/* Vote indicator */}
                  {item.vote === "down" ? (
                    <ThumbsDown className="w-4 h-4 text-[var(--danger)] shrink-0" strokeWidth={1.5} />
                  ) : (
                    <ThumbsUp className="w-4 h-4 text-[var(--verified)] shrink-0" strokeWidth={1.5} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--ink)] truncate">
                      {truncate(item.user_input || "(no input captured)", 120)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--ink-muted)]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtDate(item.created_at)}
                      </span>
                      {item.comment && (
                        <span className="truncate max-w-[200px]">
                          &quot;{item.comment}&quot;
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Status badge */}
                  <span
                    className={`shrink-0 px-2 py-0.5 text-[10px] rounded font-medium ${
                      item.triage_status === "pending"
                        ? "bg-[var(--flag-soft)] text-[var(--flag)]"
                        : item.triage_status === "promoted"
                          ? "bg-[var(--verified-soft)] text-[var(--verified)]"
                          : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)]"
                    }`}
                  >
                    {item.triage_status}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[var(--rule)] mt-1 pt-3 space-y-3">
                    {/* User input */}
                    <div>
                      <div className="label-section text-[10px] mb-1">User Input</div>
                      <div className="p-3 rounded bg-[var(--canvas-subtle)] text-xs text-[var(--ink)] whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {item.user_input || "(empty)"}
                      </div>
                    </div>

                    {/* Agent output */}
                    <div>
                      <div className="label-section text-[10px] mb-1">Agent Output</div>
                      <div className="p-3 rounded bg-[var(--canvas-subtle)] text-xs text-[var(--ink)] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono leading-relaxed">
                        {item.agent_output || "(empty)"}
                      </div>
                    </div>

                    {/* Comment */}
                    {item.comment && (
                      <div>
                        <div className="label-section text-[10px] mb-1">User Comment</div>
                        <div className="p-2 rounded bg-[var(--canvas-subtle)] text-xs text-[var(--ink-muted)] italic">
                          {item.comment}
                        </div>
                      </div>
                    )}

                    {/* Promoted info */}
                    {item.triage_status === "promoted" && item.promoted_to_eval_id && (
                      <div className="flex items-center gap-2 text-xs text-[var(--verified)]">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Promoted to eval: {item.promoted_to_eval_id}
                      </div>
                    )}

                    {/* Triage actions (only for pending) */}
                    {item.triage_status === "pending" && (
                      <div className="flex items-center gap-3 pt-2">
                        {/* Promote */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={evalIdDraft}
                            onChange={(e) => setEvalIdDraft(e.target.value)}
                            placeholder="Eval slug (e.g. lease-review-01)"
                            className="px-2 py-1.5 text-xs rounded border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-56"
                          />
                          <button
                            onClick={() => handleTriage(item.id, "promote")}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent)] text-white hover:opacity-90 transition disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            Promote
                          </button>
                        </div>

                        {/* Dismiss */}
                        <button
                          onClick={() => handleTriage(item.id, "dismiss")}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--danger)] transition disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
