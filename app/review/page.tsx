// app/review/page.tsx
//
// Supervisor review queue — shows pending autonomous agent outputs
// (emails, SMS, reminders) that need approval before sending.
// Owners and supervisors can approve or reject items inline.

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, CheckCircle2, XCircle, Clock,
  Mail, MessageSquare, Bell, FileText, AlertTriangle,
  ChevronDown, ChevronUp, Send, Loader2,
} from "lucide-react";

interface ReviewItem {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  source_kind: string | null;
  source_id: string | null;
  contact_id: string | null;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  sent_at: string | null;
  send_error: string | null;
  created_at: string;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  email: <Mail className="w-4 h-4" strokeWidth={1.5} />,
  sms: <MessageSquare className="w-4 h-4" strokeWidth={1.5} />,
  reminder: <Bell className="w-4 h-4" strokeWidth={1.5} />,
  draft: <FileText className="w-4 h-4" strokeWidth={1.5} />,
};

const STATUS_BADGE: Record<string, { class: string; label: string }> = {
  pending: { class: "bg-[var(--flag)] text-white", label: "Pending" },
  approved: { class: "bg-[var(--verified)] text-white", label: "Approved" },
  rejected: { class: "bg-[var(--ink-muted)] text-white", label: "Rejected" },
  sent: { class: "bg-[var(--accent)] text-white", label: "Sent" },
  failed: { class: "bg-[var(--danger)] text-white", label: "Failed" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60000) return "just now";
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/review?status=${filter}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setPendingCount(data.pending_count || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAction = async (itemId: string, action: "approve" | "reject") => {
    setActing((prev) => new Set(prev).add(itemId));
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ item_id: itemId, action }),
      });
      if (res.ok) {
        await load();
      }
    } finally {
      setActing((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center h-[50px] px-6 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <Link
          href="/home"
          className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition mr-3"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
        </Link>
        <AlertTriangle className="w-4 h-4 text-[var(--ink-muted)] mr-2" strokeWidth={1.5} />
        <h1 className="text-sm font-semibold text-[var(--ink)]">Review Queue</h1>
        {pendingCount > 0 && (
          <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--flag)] text-white text-[10px] font-bold">
            {pendingCount}
          </span>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2 mr-3">
          <button
            onClick={() => setFilter("pending")}
            className={`px-2.5 py-1 rounded-[4px] text-[10px] font-medium transition ${
              filter === "pending"
                ? "bg-[var(--ink)] text-[var(--canvas)]"
                : "text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)]"
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-[4px] text-[10px] font-medium transition ${
              filter === "all"
                ? "bg-[var(--ink)] text-[var(--canvas)]"
                : "text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)]"
            }`}
          >
            All
          </button>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={1.5} />
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-5 h-5 text-[var(--ink-muted)] animate-spin" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle2 className="w-8 h-8 text-[var(--verified)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-[var(--ink-muted)]">
              {filter === "pending" ? "No items awaiting review." : "No review history yet."}
            </p>
            <p className="text-[10px] text-[var(--ink-subtle)] mt-1">
              Autonomous agent outputs will appear here for approval before sending.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-3">
            {items.map((item) => {
              const isOpen = expanded.has(item.id);
              const isActing = acting.has(item.id);
              const badge = STATUS_BADGE[item.review_status] || STATUS_BADGE.pending;
              const icon = KIND_ICON[item.kind.split(".")[0]] || <Send className="w-4 h-4" strokeWidth={1.5} />;
              const payload = item.payload || {};

              return (
                <div
                  key={item.id}
                  className="bg-[var(--surface)] border border-[var(--rule)] rounded-[10px] overflow-hidden"
                >
                  <button
                    onClick={() => toggle(item.id)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[var(--canvas-subtle)] transition"
                  >
                    <span className="text-[var(--ink-muted)]">{icon}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[3px] shrink-0 ${badge.class}`}>
                      {badge.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-[var(--ink)] block truncate">
                        {String(payload.subject || payload.to || item.kind)}
                      </span>
                      <span className="text-[10px] text-[var(--ink-subtle)] block truncate">
                        {item.source_kind ? `via ${item.source_kind}` : item.kind} -- {formatDate(item.created_at)}
                      </span>
                    </div>
                    {isOpen
                      ? <ChevronUp className="w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                      : <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                    }
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-[var(--rule)]">
                      {/* Payload preview */}
                      <div className="mt-3 p-3 rounded-[6px] bg-[var(--canvas)] border border-[var(--rule)] text-xs text-[var(--ink)] leading-relaxed max-h-[300px] overflow-y-auto">
                        {typeof payload.to === "string" && payload.to && (
                          <div className="mb-2">
                            <span className="text-[var(--ink-muted)]">To: </span>
                            <span className="font-medium">{payload.to}</span>
                          </div>
                        )}
                        {typeof payload.subject === "string" && payload.subject && (
                          <div className="mb-2">
                            <span className="text-[var(--ink-muted)]">Subject: </span>
                            <span className="font-medium">{payload.subject}</span>
                          </div>
                        )}
                        {typeof payload.body === "string" && payload.body && (
                          <div className="whitespace-pre-wrap">{payload.body}</div>
                        )}
                        {typeof payload.text === "string" && !payload.body && payload.text && (
                          <div className="whitespace-pre-wrap">{payload.text}</div>
                        )}
                        {typeof payload.html === "string" && !payload.body && !payload.text && payload.html && (
                          <div
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: payload.html.slice(0, 2000) }}
                          />
                        )}
                        {!payload.body && !payload.text && !payload.html && (
                          <pre className="text-[10px] text-[var(--ink-muted)] whitespace-pre-wrap font-mono">
                            {JSON.stringify(payload, null, 2).slice(0, 1000)}
                          </pre>
                        )}
                      </div>

                      {/* Review note (if reviewed) */}
                      {item.review_note && (
                        <div className="mt-2 text-[10px] text-[var(--ink-muted)]">
                          Note: {item.review_note}
                        </div>
                      )}

                      {/* Send error (if failed) */}
                      {item.send_error && (
                        <div className="mt-2 text-[10px] text-[var(--danger)]">
                          Send error: {item.send_error}
                        </div>
                      )}

                      {/* Action buttons (only for pending) */}
                      {item.review_status === "pending" && (
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleAction(item.id, "approve")}
                            disabled={isActing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--verified)] text-white text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
                          >
                            {isActing
                              ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                              : <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
                            }
                            Approve and send
                          </button>
                          <button
                            onClick={() => handleAction(item.id, "reject")}
                            disabled={isActing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--ink-muted)] text-xs font-medium hover:bg-[var(--canvas-subtle)] transition disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" strokeWidth={2} />
                            Reject
                          </button>
                        </div>
                      )}

                      {/* Reviewed info */}
                      {item.reviewed_at && (
                        <div className="mt-2 text-[10px] text-[var(--ink-subtle)]">
                          {item.review_status === "approved" || item.review_status === "sent"
                            ? "Approved"
                            : "Rejected"
                          } {formatDate(item.reviewed_at)}
                          {item.sent_at && ` -- sent ${formatDate(item.sent_at)}`}
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
    </div>
  );
}
