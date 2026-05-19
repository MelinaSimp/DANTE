"use client";

// app/dante/churn/DanteChurnClient.tsx
//
// Dante · Client Briefs — the LLM-grounded replacement for the old
// 0-100 churn scoreboard.
//
// What changed and why:
//   Old: weighted sum of 6 signals → opaque number. Advisors squinted
//        at "72" and couldn't tell you what to do about it.
//   New: Haiku-generated brief per contact. Every reason cites a real
//        note/appointment/call/event. Risk is one of four named tiers,
//        not a false-precision integer.
//
// The route path stays `/dante/churn` so existing links don't break,
// but the surface is now briefs. The recompute button became "Rank
// my book" (POST /api/dante/briefs) which fans out through the
// rank-my-book worker.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DanteGateLink from "@/components/dante/DanteGateLink";
import { DriftMark } from "@/components/dante/DriftMark";
import {
  ArrowLeft, RefreshCw, AlertTriangle, TrendingDown, Activity,
  ShieldCheck, ChevronDown, ChevronUp, Phone, Mail, Loader2,
  Flame, MessageSquare, CalendarClock, PhoneCall, TrendingUp,
  Lightbulb,
} from "lucide-react";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";

type RiskLevel = "healthy" | "watch" | "act_now" | "critical";
type SourceTable = "note" | "appointment" | "call" | "churn_event";

interface Reason {
  text: string;
  source_table: SourceTable;
  source_id: string;
  source_excerpt?: string;
}

interface BriefRow {
  contact_id: string;
  risk_level: RiskLevel;
  headline: string;
  reasons: Reason[];
  recommended_action: string | null;
  talking_points: string[];
  confidence: number;
  model: string;
  generated_at: string;
  contact:
    | { id: string; name: string | null; email: string | null; phone: string | null }
    | null;
}

const RISK_STYLE: Record<
  RiskLevel,
  { label: string; bg: string; fg: string; dot: string }
> = {
  critical: { label: "Critical",  bg: "bg-[var(--danger-soft)]",   fg: "text-[var(--danger)]",   dot: "bg-[var(--danger)]" },
  act_now:  { label: "Act now",   bg: "bg-[var(--flag-soft)]",     fg: "text-[var(--flag)]",     dot: "bg-[var(--flag)]" },
  watch:    { label: "Watch",     bg: "bg-[var(--accent-soft)]",   fg: "text-[var(--accent)]",   dot: "bg-[var(--accent)]" },
  healthy:  { label: "Healthy",   bg: "bg-[var(--verified-soft)]", fg: "text-[var(--verified)]", dot: "bg-[var(--verified)]" },
};

const RISK_ORDER: RiskLevel[] = ["critical", "act_now", "watch", "healthy"];

const SOURCE_ICON: Record<SourceTable, typeof MessageSquare> = {
  note: MessageSquare,
  appointment: CalendarClock,
  call: PhoneCall,
  churn_event: TrendingUp,
};

const SOURCE_LABEL: Record<SourceTable, string> = {
  note: "Note",
  appointment: "Appointment",
  call: "Call",
  churn_event: "Event",
};

export default function DanteChurnClient() {
  const brand = useAssistantBrand();
  const [rows, setRows] = useState<BriefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [rankSummary, setRankSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/briefs", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.briefs || []);
      const briefs: BriefRow[] = json.briefs || [];
      const newest = briefs.reduce<string | null>(
        (acc, b) =>
          !acc || new Date(b.generated_at) > new Date(acc)
            ? b.generated_at
            : acc,
        null
      );
      if (newest) setLastGenerated(newest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const rankBook = useCallback(
    async (force: boolean) => {
      setRanking(true);
      setError(null);
      setRankSummary(null);
      try {
        const res = await fetch("/api/dante/briefs", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        setRankSummary(
          `Generated ${json.generated} brief${json.generated === 1 ? "" : "s"}` +
            (json.skipped_fresh
              ? `, skipped ${json.skipped_fresh} fresh`
              : "") +
            (json.failed ? `, ${json.failed} failed` : "") +
            (json.capped ? ` (capped at ${json.attempted} this run)` : "")
        );
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Rank-book failed");
      } finally {
        setRanking(false);
      }
    },
    [load]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Force Harvey canvas on <html> / <body> — matches the rest of the app.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("color", "var(--ink)", "important");
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
    };
  }, []);

  const counts = RISK_ORDER.reduce<Record<RiskLevel, number>>(
    (acc, t) => {
      acc[t] = rows.filter((r) => r.risk_level === t).length;
      return acc;
    },
    { healthy: 0, watch: 0, act_now: 0, critical: 0 }
  );

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <DanteGateLink variant="breadcrumb" />
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Briefs</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => rankBook(false)}
            disabled={ranking}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium disabled:opacity-50"
          >
            <DriftMark className={`w-4 h-4 ${ranking ? "animate-pulse" : ""}`} />
            {ranking ? "Ranking…" : "Rank my book"}
          </button>
          <Link href="/dante" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">{brand.name}</span>
          </Link>
        </div>
      </div>

      <div className="px-6 md:px-8 py-8 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="label-section mb-2">Dante · Client briefs</div>
            <h1 className="heading-display text-4xl text-[var(--ink)] mb-2">
              Who to call this week
            </h1>
            <p className="text-sm text-[var(--ink-muted)] max-w-2xl">
              Each brief is written by a small model reading only this
              client's notes, appointments, calls, and event log. Every reason
              cites the row it came from. No ranking model, no black box —
              just grounded, verifiable reads of what's in your CRM.
            </p>
            {lastGenerated && (
              <p className="text-xs text-[var(--ink-subtle)] mt-2">
                Newest brief generated {new Date(lastGenerated).toLocaleString()}
              </p>
            )}
            {rankSummary && (
              <p className="text-xs text-[var(--ink-muted)] mt-1">{rankSummary}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="border border-[var(--rule)] bg-[var(--danger-soft)] rounded-[6px] p-4 mb-6 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {/* Risk-level summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {RISK_ORDER.map((tier) => {
            const st = RISK_STYLE[tier];
            const Icon =
              tier === "critical" ? Flame
              : tier === "act_now" ? AlertTriangle
              : tier === "watch" ? TrendingDown
              : ShieldCheck;
            return (
              <div key={tier} className="card-flat p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="label-section">{st.label}</span>
                  <div className={`rounded-[4px] p-1.5 ${st.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${st.fg}`} strokeWidth={1.5} />
                  </div>
                </div>
                <div className="text-2xl font-semibold text-[var(--ink)]">
                  {counts[tier]}
                </div>
              </div>
            );
          })}
        </div>

        {/* Ranked brief list */}
        {loading ? (
          <div className="card-flat p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-muted)] mx-auto" strokeWidth={1.5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="card-flat p-12 text-center">
            <Activity className="h-10 w-10 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[var(--ink-muted)] mb-1">No briefs yet</p>
            <p className="text-xs text-[var(--ink-subtle)] mb-4 max-w-md mx-auto">
              Rank your book to generate one grounded brief per contact.
              Lazy-cached 24h so re-visiting a client doesn't rerun the model.
            </p>
            <button
              onClick={() => rankBook(false)}
              disabled={ranking}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-50"
            >
              {ranking
                ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                : <DriftMark className="w-4 h-4" />}
              {ranking ? "Ranking…" : "Rank my book"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const st = RISK_STYLE[row.risk_level];
              const isOpen = expanded === row.contact_id;
              return (
                <div key={row.contact_id} className="card-flat overflow-hidden">
                  <button
                    onClick={() =>
                      setExpanded(isOpen ? null : row.contact_id)
                    }
                    className="w-full px-5 py-4 flex items-start gap-4 hover:bg-[var(--canvas-subtle)] transition text-left"
                  >
                    {/* Risk pill */}
                    <div className={`w-14 h-14 rounded-[6px] ${st.bg} flex flex-col items-center justify-center shrink-0`}>
                      <span className={`w-2 h-2 rounded-full ${st.dot} mb-1`} />
                      <span className={`text-[9px] uppercase tracking-wide ${st.fg} font-semibold`}>
                        {st.label}
                      </span>
                    </div>

                    {/* Contact + headline */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold text-[var(--ink)] truncate">
                          {row.contact?.name || "Unknown contact"}
                        </h3>
                        {row.contact?.email && (
                          <span className="flex items-center gap-1 text-xs text-[var(--ink-muted)]">
                            <Mail className="h-3 w-3" strokeWidth={1.5} />
                            {row.contact.email}
                          </span>
                        )}
                        {row.contact?.phone && (
                          <span className="flex items-center gap-1 text-xs text-[var(--ink-muted)]">
                            <Phone className="h-3 w-3" strokeWidth={1.5} />
                            {row.contact.phone}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--ink)] mb-2 leading-snug">
                        {row.headline}
                      </p>
                      {row.reasons.length > 0 && !isOpen && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {row.reasons.slice(0, 3).map((r, i) => {
                            const Icon = SOURCE_ICON[r.source_table];
                            return (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--rule)] bg-[var(--canvas-subtle)] text-[11px] text-[var(--ink-muted)]"
                              >
                                <Icon className="h-3 w-3" strokeWidth={1.5} />
                                {SOURCE_LABEL[r.source_table]}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {isOpen
                      ? <ChevronUp className="h-4 w-4 text-[var(--ink-muted)] shrink-0 mt-1" strokeWidth={1.5} />
                      : <ChevronDown className="h-4 w-4 text-[var(--ink-muted)] shrink-0 mt-1" strokeWidth={1.5} />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-[var(--rule)] bg-[var(--canvas-subtle)] px-5 py-5 space-y-5">
                      {/* Reasons with citations */}
                      {row.reasons.length > 0 && (
                        <div>
                          <div className="label-section mb-2">Why</div>
                          <ol className="space-y-3">
                            {row.reasons.map((r, i) => {
                              const Icon = SOURCE_ICON[r.source_table];
                              return (
                                <li
                                  key={i}
                                  className="text-sm text-[var(--ink)] leading-snug"
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--rule)] bg-[var(--canvas)] text-[10px] text-[var(--ink-muted)] shrink-0">
                                      <Icon className="h-3 w-3" strokeWidth={1.5} />
                                      {SOURCE_LABEL[r.source_table]}
                                    </span>
                                    <span>{r.text}</span>
                                  </div>
                                  {r.source_excerpt && (
                                    <blockquote className="mt-1 ml-6 pl-3 border-l-2 border-[var(--rule)] text-xs text-[var(--ink-muted)] italic">
                                      {r.source_excerpt}
                                    </blockquote>
                                  )}
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      )}

                      {/* Recommended action */}
                      {row.recommended_action && (
                        <div>
                          <div className="label-section mb-2 flex items-center gap-1.5">
                            <Lightbulb className="h-3 w-3" strokeWidth={1.5} />
                            Do this next
                          </div>
                          <p className="text-sm text-[var(--ink)]">
                            {row.recommended_action}
                          </p>
                        </div>
                      )}

                      {/* Talking points */}
                      {row.talking_points.length > 0 && (
                        <div>
                          <div className="label-section mb-2">Talking points</div>
                          <ul className="space-y-1.5 list-disc list-inside">
                            {row.talking_points.map((p, i) => (
                              <li key={i} className="text-sm text-[var(--ink)] leading-snug">
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-4 border-t border-[var(--rule)] text-xs text-[var(--ink-subtle)]">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/client-details-overview?contactId=${row.contact_id}`}
                            className="font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2"
                          >
                            Open client record →
                          </Link>
                          <span>·</span>
                          <span>confidence {Math.round(row.confidence * 100)}%</span>
                          <span>·</span>
                          <span>{row.model}</span>
                        </div>
                        <RefreshBriefButton
                          contactId={row.contact_id}
                          onDone={load}
                        />
                      </div>
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

// Per-row regenerate button — lets an advisor force a fresh brief if
// they just logged something the 24h cache hasn't picked up yet.
function RefreshBriefButton({
  contactId,
  onDone,
}: {
  contactId: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          const res = await fetch(`/api/dante/briefs/${contactId}`, {
            method: "POST",
            credentials: "include",
          });
          if (res.ok) await onDone();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
      ) : (
        <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
      )}
      Refresh
    </button>
  );
}
