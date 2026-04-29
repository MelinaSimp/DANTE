"use client";

// AuditClient — workspace-scoped audit log surface.
//
// Three levers in one view:
//   1. Search — free text against action / entity_type / actor_label /
//      entity_id (case-insensitive contains).
//   2. Faceted filters — action prefix, entity type, date range.
//   3. Export — same filter set, downloads as CSV. The "show your
//      work" button regulators ask for.
//
// Each row expands inline to show the metadata blob — no per-event
// detail page in v1. The metadata is the audit's interesting part;
// burying it behind a click would defeat the purpose.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Download,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Filter,
  Bot,
  User as UserIcon,
  Clock,
  Globe,
} from "lucide-react";

interface AuditEvent {
  id: string;
  actor_user_id: string | null;
  actor_kind: "user" | "agent" | "cron" | "webhook" | "system";
  actor_label: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const ACTION_NAMESPACE_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "email.*", label: "Email" },
  { value: "reminder.*", label: "Reminders" },
  { value: "property.*", label: "Properties" },
  { value: "contact.*", label: "Contacts" },
  { value: "compliance_flag.*", label: "Compliance" },
  { value: "document.*", label: "Documents" },
  { value: "work.*", label: "Work queue" },
];

const ACTOR_KIND_BADGE: Record<AuditEvent["actor_kind"], string> = {
  user: "User",
  agent: "Agent",
  cron: "Cron",
  webhook: "Webhook",
  system: "System",
};

function fmtTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

export default function AuditClient() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [actionNs, setActionNs] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const buildQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (actionNs) p.set("action", actionNs);
      if (since) p.set("since", new Date(since).toISOString());
      if (until) {
        // Inclusive of the chosen day's end-of-day in local tz.
        const u = new Date(until);
        u.setHours(23, 59, 59, 999);
        p.set("until", u.toISOString());
      }
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },
    [q, actionNs, since, until],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/audit?${buildQuery({ limit: "100" })}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      const j = await r.json();
      setEvents(Array.isArray(j) ? j : []);
    } catch (e: any) {
      setError(e.message || "Failed to load");
      setEvents([]);
    }
  }, [buildQuery]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    const url = `/api/audit/export?${buildQuery()}`;
    window.location.href = url;
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const grouped = useMemo(() => {
    if (!events) return [];
    const byDate = new Map<string, AuditEvent[]>();
    for (const e of events) {
      const date = fmtTime(e.created_at).date;
      const arr = byDate.get(date) || [];
      arr.push(e);
      byDate.set(date, arr);
    }
    return Array.from(byDate.entries()).map(([date, evs]) => ({ date, events: evs }));
  }, [events]);

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Audit log</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs text-[var(--ink-muted)] transition"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
              Refresh
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-semibold hover:opacity-90 transition"
              title="Download CSV"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-8">
          <div className="label-section mb-1">Show your work</div>
          <h1 className="heading-display text-4xl text-[var(--ink)]">Audit log</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-xl">
            Every meaningful action in this workspace, append-only. Filter by
            kind, search by entity, export the lot as CSV when your compliance
            officer asks.
          </p>
        </div>

        {/* Filters */}
        <div className="card-flat p-4 mb-6 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
              Search
            </div>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
                strokeWidth={1.5}
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
                placeholder="action / entity / actor / id"
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] pl-9 pr-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]"
              />
            </div>
          </div>
          <div>
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
              Action
            </div>
            <select
              value={actionNs}
              onChange={(e) => setActionNs(e.target.value)}
              className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              {ACTION_NAMESPACE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
              Since
            </div>
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            />
          </div>
          <div>
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
              Until
            </div>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            />
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-semibold hover:opacity-90 transition"
          >
            <Filter className="w-3.5 h-3.5" strokeWidth={1.5} />
            Apply
          </button>
          {(q || actionNs || since || until) && (
            <button
              onClick={() => {
                setQ("");
                setActionNs("");
                setSince("");
                setUntil("");
                setTimeout(load, 0);
              }}
              className="text-[11px] text-[var(--ink-subtle)] hover:text-[var(--ink)] transition"
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {events === null ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
          </div>
        ) : events.length === 0 ? (
          <div className="card-flat py-16 text-center">
            <Clock className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-[var(--ink)] font-medium mb-1">
              No events match.
            </p>
            <p className="text-xs text-[var(--ink-muted)]">
              Try widening the date range or clearing filters.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((g) => (
              <section key={g.date}>
                <h2 className="text-xs mono uppercase tracking-wider text-[var(--ink-muted)] mb-3">
                  {g.date}{" "}
                  <span className="text-[var(--ink-subtle)]">· {g.events.length}</span>
                </h2>
                <ul className="card-flat overflow-hidden divide-y divide-[var(--rule)]">
                  {g.events.map((e) => {
                    const t = fmtTime(e.created_at);
                    const isOpen = expanded.has(e.id);
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => toggleExpand(e.id)}
                          className="w-full text-left px-4 py-3 hover:bg-[var(--canvas-subtle)] transition"
                        >
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 mt-0.5">
                              {isOpen ? (
                                <ChevronDown className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                              )}
                            </div>
                            <div className="shrink-0 mt-0.5">
                              {e.actor_kind === "user" ? (
                                <UserIcon className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                              ) : (
                                <Bot className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-sm mono text-[var(--ink)]">
                                  {e.action}
                                </span>
                                <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                                  {ACTOR_KIND_BADGE[e.actor_kind]}
                                </span>
                                {e.entity_id && (
                                  <span className="text-[11px] text-[var(--ink-subtle)] mono">
                                    {e.entity_type}:{e.entity_id.slice(0, 8)}
                                  </span>
                                )}
                                <span className="ml-auto text-[10px] mono text-[var(--ink-subtle)]">
                                  {t.time}
                                </span>
                              </div>
                              {e.actor_label && (
                                <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 truncate">
                                  {e.actor_label}
                                </div>
                              )}
                            </div>
                          </div>

                          {isOpen && (
                            <div className="mt-3 ml-8 space-y-2 text-xs">
                              {e.metadata &&
                                Object.keys(e.metadata).length > 0 && (
                                  <div>
                                    <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
                                      Metadata
                                    </div>
                                    <pre className="bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[4px] p-3 overflow-x-auto text-[11px] mono text-[var(--ink)] whitespace-pre-wrap">
                                      {JSON.stringify(e.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              {e.ip_address && (
                                <div className="text-[var(--ink-muted)] inline-flex items-center gap-1.5">
                                  <Globe className="w-3 h-3" strokeWidth={1.5} />
                                  {e.ip_address}
                                </div>
                              )}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
