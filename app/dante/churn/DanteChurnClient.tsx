"use client";

// app/dante/churn/DanteChurnClient.tsx
//
// The at-risk dashboard. Three pieces stacked:
//   1. Top bar with breadcrumb + Recompute button
//   2. Tier summary cards (critical/at-risk/watch/healthy counts)
//   3. Ranked client list — expand a row to see signals + a small
//      "why this score" breakdown
//
// Shares the Harvey token set with the rest of the app. No charts
// here by design — phase 2 adds a sparkline of score-over-time once
// we're storing a history rather than a single latest row.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, AlertTriangle, TrendingDown, Activity,
  ShieldCheck, ChevronDown, ChevronUp, Phone, Mail, Loader2,
  Flame,
} from "lucide-react";

type Tier = "healthy" | "watch" | "at_risk" | "critical";

interface Signal {
  key: string;
  label: string;
  raw: string | number | null;
  normalized: number;
  weight: number;
  contribution: number;
  detail?: string;
}

interface ChurnRow {
  id: string;
  contact_id: string;
  score: number;
  tier: Tier;
  signals: Signal[];
  summary: string | null;
  computed_at: string;
  contact: { id: string; name: string; email: string | null; phone: string | null } | null;
}

const TIER_STYLE: Record<Tier, { label: string; bg: string; fg: string; dot: string }> = {
  critical: { label: "Critical",  bg: "bg-[var(--danger-soft)]",  fg: "text-[var(--danger)]",  dot: "bg-[var(--danger)]" },
  at_risk:  { label: "At risk",   bg: "bg-[var(--flag-soft)]",    fg: "text-[var(--flag)]",    dot: "bg-[var(--flag)]" },
  watch:    { label: "Watch",     bg: "bg-[var(--accent-soft)]",  fg: "text-[var(--accent)]",  dot: "bg-[var(--accent)]" },
  healthy:  { label: "Healthy",   bg: "bg-[var(--verified-soft)]", fg: "text-[var(--verified)]", dot: "bg-[var(--verified)]" },
};

const TIER_ORDER: Tier[] = ["critical", "at_risk", "watch", "healthy"];

export default function DanteChurnClient() {
  const [rows, setRows] = useState<ChurnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastComputed, setLastComputed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/churn", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.scores || []);
      if (json.scores?.[0]?.computed_at) setLastComputed(json.scores[0].computed_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const recompute = useCallback(async () => {
    setRecomputing(true);
    setError(null);
    try {
      const res = await fetch("/api/dante/churn/recompute", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recompute failed");
    } finally {
      setRecomputing(false);
    }
  }, [load]);

  useEffect(() => { load(); }, [load]);

  // Force Harvey canvas on <html> / <body> (other app pages do this
  // too — Next doesn't give us a neat way to scope root bg).
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

  const counts = TIER_ORDER.reduce<Record<Tier, number>>((acc, t) => {
    acc[t] = rows.filter((r) => r.tier === t).length;
    return acc;
  }, { healthy: 0, watch: 0, at_risk: 0, critical: 0 });

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dante" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition">Dante</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Churn</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={recompute} disabled={recomputing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${recomputing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            {recomputing ? "Recomputing…" : "Recompute"}
          </button>
          <Link href="/dante" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Dante</span>
          </Link>
        </div>
      </div>

      <div className="px-6 md:px-8 py-8 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="label-section mb-2">Dante · Churn prediction</div>
            <h1 className="heading-display text-4xl text-[var(--ink)] mb-2">At-risk clients</h1>
            <p className="text-sm text-[var(--ink-muted)] max-w-2xl">
              Dante scores every contact on a 0–100 risk scale by blending five
              signals — recency, meeting attendance, engagement volume, call
              sentiment, and contact-gap trajectory. Click a row to see the
              breakdown.
            </p>
            {lastComputed && (
              <p className="text-xs text-[var(--ink-subtle)] mt-2">
                Last computed {new Date(lastComputed).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="border border-[var(--rule)] bg-[var(--danger-soft)] rounded-[6px] p-4 mb-6 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {/* Tier summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {TIER_ORDER.map((tier) => {
            const st = TIER_STYLE[tier];
            const Icon = tier === "critical" ? Flame
              : tier === "at_risk" ? AlertTriangle
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
                <div className="text-2xl font-semibold text-[var(--ink)]">{counts[tier]}</div>
              </div>
            );
          })}
        </div>

        {/* Ranked list */}
        {loading ? (
          <div className="card-flat p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-muted)] mx-auto" strokeWidth={1.5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="card-flat p-12 text-center">
            <Activity className="h-10 w-10 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[var(--ink-muted)] mb-1">No scores yet</p>
            <p className="text-xs text-[var(--ink-subtle)] mb-4">
              Click Recompute to score every contact in this workspace.
            </p>
            <button onClick={recompute} disabled={recomputing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-50">
              {recomputing ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <RefreshCw className="w-4 h-4" strokeWidth={1.5} />}
              {recomputing ? "Recomputing…" : "Recompute now"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const st = TIER_STYLE[row.tier];
              const isOpen = expanded === row.id;
              return (
                <div key={row.id} className="card-flat overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                    className="w-full px-5 py-4 flex items-center gap-4 hover:bg-[var(--canvas-subtle)] transition text-left"
                  >
                    {/* Score badge */}
                    <div className={`w-14 h-14 rounded-[6px] ${st.bg} flex flex-col items-center justify-center shrink-0`}>
                      <span className={`text-xl font-semibold ${st.fg}`}>{row.score}</span>
                      <span className={`text-[9px] uppercase tracking-wide ${st.fg} opacity-80`}>risk</span>
                    </div>

                    {/* Contact */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-[var(--ink)] truncate">
                          {row.contact?.name || "Unknown contact"}
                        </h3>
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.fg} border border-[var(--rule)]`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--ink-muted)]">
                        {row.contact?.email && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3" strokeWidth={1.5} />{row.contact.email}
                          </span>
                        )}
                        {row.contact?.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" strokeWidth={1.5} />{row.contact.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Top 2 signals preview */}
                    <div className="hidden md:flex items-center gap-2 shrink-0">
                      {topSignals(row.signals, 2).map((s) => (
                        <div key={s.key} className="text-right">
                          <div className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wide">{s.label}</div>
                          <div className="text-xs text-[var(--ink)] font-medium">{formatRaw(s.raw)}</div>
                        </div>
                      ))}
                    </div>

                    {isOpen
                      ? <ChevronUp className="h-4 w-4 text-[var(--ink-muted)] shrink-0" strokeWidth={1.5} />
                      : <ChevronDown className="h-4 w-4 text-[var(--ink-muted)] shrink-0" strokeWidth={1.5} />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-[var(--rule)] bg-[var(--canvas-subtle)] px-5 py-5">
                      <div className="label-section mb-3">Signal breakdown</div>
                      <div className="space-y-3">
                        {row.signals.map((s) => (
                          <div key={s.key}>
                            <div className="flex items-center justify-between mb-1 text-xs">
                              <span className="text-[var(--ink)] font-medium">{s.label}</span>
                              <span className="text-[var(--ink-muted)]">
                                {formatRaw(s.raw)} · +{Math.round(s.contribution * 100)}pt
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[var(--canvas-muted)] overflow-hidden">
                              <div
                                className="h-full bg-[var(--ink)]"
                                style={{ width: `${Math.round(s.normalized * 100)}%` }}
                              />
                            </div>
                            {s.detail && (
                              <p className="text-[11px] text-[var(--ink-subtle)] mt-1">{s.detail}</p>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-5 pt-4 border-t border-[var(--rule)]">
                        <Link
                          href={`/client-details-overview?contactId=${row.contact_id}`}
                          className="text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2"
                        >
                          Open client record →
                        </Link>
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

// Helpers ─────────────────────────────────────────────────────

function topSignals(signals: Signal[], n: number): Signal[] {
  return [...signals].sort((a, b) => b.contribution - a.contribution).slice(0, n);
}

function formatRaw(v: Signal["raw"]): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}
