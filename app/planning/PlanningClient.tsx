"use client";

// PlanningClient — bento header with the four signal categories, then
// a unified active-signals feed below. The runner here lets the
// advisor force-refresh the analyzers across the whole book without
// waiting for the Monday cron.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  TrendingUp,
  Clock,
  Receipt,
  Users,
  X,
} from "lucide-react";
import CreativeCard from "@/components/ui/creative-card";

type SignalType =
  | "roth_conversion"
  | "rmd_due"
  | "tax_loss_harvest"
  | "beneficiary_mismatch";

interface Signal {
  id: string;
  contact_id: string;
  contact_name: string | null;
  signal_type: SignalType;
  severity: "info" | "warn" | "action";
  title: string;
  summary: string | null;
  payload: Record<string, any>;
  citations: Array<{ kind: string; id: string; label: string }>;
  computed_at: string;
  dismissed_at: string | null;
}

const SIGNAL_META: Record<
  SignalType,
  { label: string; icon: any; description: string }
> = {
  roth_conversion: {
    label: "Roth conversion",
    icon: TrendingUp,
    description:
      "Clients with bracket headroom and pre-tax balances worth converting.",
  },
  rmd_due: {
    label: "RMD",
    icon: Clock,
    description:
      "Required minimum distributions for clients past their SECURE 2.0 trigger age.",
  },
  tax_loss_harvest: {
    label: "Tax-loss harvesting",
    icon: Receipt,
    description:
      "Realized losses YTD, wash-sale impact, and carryforward eligibility.",
  },
  beneficiary_mismatch: {
    label: "Beneficiaries",
    icon: Users,
    description:
      "Account designations vs. trust intent, missing contingents, estate-named accounts.",
  },
};

function severityChip(severity: Signal["severity"]) {
  if (severity === "action") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-[2px]"
        style={{
          color: "var(--accent)",
          background: "var(--accent-soft, rgba(0,0,0,0.04))",
          border: "1px solid var(--accent)",
        }}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        action
      </span>
    );
  }
  if (severity === "warn") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-[2px]"
        style={{ color: "var(--ink-muted)", border: "1px solid var(--rule)" }}
      >
        warn
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-[2px]"
      style={{ color: "var(--ink-subtle)", border: "1px solid var(--rule)" }}
    >
      info
    </span>
  );
}

const SEVERITY_ORDER: Record<Signal["severity"], number> = {
  action: 0,
  warn: 1,
  info: 2,
};

export default function PlanningClient() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filterType, setFilterType] = useState<SignalType | "all">("all");
  const [lastRun, setLastRun] = useState<{
    contacts: number;
    signals: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/planning/signals", {
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || "Failed to load");
        return;
      }
      setSignals((j.signals as Signal[]) || []);
      setCounts((j.counts as Record<string, number>) || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    setErr(null);
    try {
      const r = await fetch("/api/planning/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || "Run failed");
        return;
      }
      setLastRun({
        contacts: j.contactCount || 0,
        signals: j.signalCount || 0,
      });
      await load();
    } finally {
      setRunning(false);
    }
  };

  const dismiss = async (signalId: string) => {
    const reason = window.prompt("Reason (optional):") || "";
    const r = await fetch(`/api/planning/signals/${signalId}/dismiss`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (r.ok) await load();
  };

  const filtered = useMemo(() => {
    const list =
      filterType === "all"
        ? signals
        : signals.filter((s) => s.signal_type === filterType);
    return [...list].sort((a, b) => {
      const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (s !== 0) return s;
      return (
        new Date(b.computed_at).getTime() - new Date(a.computed_at).getTime()
      );
    });
  }, [signals, filterType]);

  const totalActive = signals.length;

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <div className="label-section mb-1">Planning</div>
            <h1 className="heading-display text-3xl text-[var(--ink)]">
              What needs attention this week
            </h1>
            <p className="prose-body text-[var(--ink-muted)] mt-1.5 max-w-prose">
              {totalActive === 0
                ? "No findings yet. Run the planning agents to scan the book."
                : `${totalActive} active finding${totalActive === 1 ? "" : "s"} across your book — sorted by severity.`}
            </p>
          </div>
          <button
            onClick={runNow}
            disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Sparkles className="w-4 h-4" strokeWidth={1.5} />
            )}
            {running ? "Running…" : "Run planning agents"}
          </button>
        </div>
        {lastRun && (
          <div className="text-xs text-[var(--ink-muted)] -mt-4 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--verified)]" strokeWidth={1.5} />
            Scanned {lastRun.contacts} contact
            {lastRun.contacts === 1 ? "" : "s"} · {lastRun.signals} finding
            {lastRun.signals === 1 ? "" : "s"} produced
          </div>
        )}
        {err && (
          <div className="text-xs text-[var(--danger)]">{err}</div>
        )}

        {/* Bento — four category tiles */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {(Object.keys(SIGNAL_META) as SignalType[]).map((t) => {
            const meta = SIGNAL_META[t];
            const Icon = meta.icon;
            const count = counts[t] || 0;
            const top = signals.find((s) => s.signal_type === t);
            const active = filterType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(active ? "all" : t)}
                className="text-left rounded-[6px] border bg-[var(--canvas)] hover:border-[var(--rule-strong)] transition p-5 flex flex-col min-h-[180px] overflow-hidden"
                style={{
                  borderColor: active ? "var(--ink)" : "var(--rule)",
                  borderWidth: active ? 1 : 1,
                  boxShadow: active ? "inset 0 0 0 1px var(--ink)" : undefined,
                }}
              >
                <div className="flex items-center gap-1.5 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-3">
                  <Icon
                    className="w-3.5 h-3.5 text-[var(--ink-muted)]"
                    strokeWidth={1.5}
                  />
                  <span>{meta.label}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-3xl font-semibold mono tabular-nums text-[var(--ink)]">
                    {count}
                  </div>
                  <div className="text-[10px] text-[var(--ink-subtle)] mono uppercase tracking-wider">
                    {count === 1 ? "client" : "clients"}
                  </div>
                </div>
                <p className="text-[11px] text-[var(--ink-muted)] mt-2 leading-relaxed">
                  {meta.description}
                </p>
                {top && (
                  <div className="mt-auto pt-3 border-t border-[var(--rule)]">
                    <div className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wider mono">
                      Top signal
                    </div>
                    <div className="text-xs text-[var(--ink)] truncate mt-0.5">
                      {top.contact_name || "Client"} · {top.title}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Filter strip */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterType("all")}
            className="text-xs px-2.5 py-1.5 rounded-[4px] transition"
            style={{
              border:
                filterType === "all"
                  ? "1px solid var(--ink)"
                  : "1px solid var(--rule)",
              background:
                filterType === "all"
                  ? "var(--canvas-subtle)"
                  : "var(--canvas)",
              color: "var(--ink)",
              fontWeight: filterType === "all" ? 600 : 400,
            }}
          >
            All · {totalActive}
          </button>
          {(Object.keys(SIGNAL_META) as SignalType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className="text-xs px-2.5 py-1.5 rounded-[4px] transition"
              style={{
                border:
                  filterType === t
                    ? "1px solid var(--ink)"
                    : "1px solid var(--rule)",
                background:
                  filterType === t ? "var(--canvas-subtle)" : "var(--canvas)",
                color: "var(--ink)",
                fontWeight: filterType === t ? 600 : 400,
              }}
            >
              {SIGNAL_META[t].label} · {counts[t] || 0}
            </button>
          ))}
        </div>

        {/* Signal list */}
        {loading && signals.length === 0 ? (
          <div className="text-xs text-[var(--ink-subtle)] flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            Loading signals…
          </div>
        ) : filtered.length === 0 ? (
          <CreativeCard className="p-8">
            <p className="text-sm text-[var(--ink)] font-semibold mb-3 text-center">
              {filterType === "all"
                ? "No active signals."
                : `No ${SIGNAL_META[filterType].label} signals.`}
            </p>
            <div className="max-w-xl mx-auto space-y-2 text-xs text-[var(--ink-muted)] leading-relaxed">
              <p>
                Each analyzer needs specific parsed data to fire. If you're
                seeing zero findings on a vertical you'd expect, the most
                likely cause is missing data for that analyzer:
              </p>
              <ul className="space-y-1.5 mt-2 text-[11px]">
                <li>
                  <strong className="text-[var(--ink)]">Roth conversion</strong>{" "}
                  — needs a recent <span className="mono">Form 1040</span> to
                  anchor bracket math, plus pre-tax balances from{" "}
                  <span className="mono">5498</span> or a retirement statement.
                </li>
                <li>
                  <strong className="text-[var(--ink)]">RMD</strong> — needs the
                  contact's <span className="mono">date_of_birth</span> set, plus
                  a 5498 (Box 5 prior-year FMV) or retirement statement.
                </li>
                <li>
                  <strong className="text-[var(--ink)]">Tax-loss harvesting</strong>{" "}
                  — needs a current-year <span className="mono">1099-B</span>{" "}
                  with realized losses or wash-sale flags.
                </li>
                <li>
                  <strong className="text-[var(--ink)]">Beneficiaries</strong> —
                  needs at least one parsed <span className="mono">beneficiary form</span>
                  {" "}or insurance policy declarations page; trust mismatch needs
                  a <span className="mono">trust document</span> too.
                </li>
              </ul>
              <p className="pt-2 text-[var(--ink-subtle)]">
                Upload + extract docs on each client's profile → Holdings.
                Analyzers re-run weekly (Mon 5 UTC) or now via the button above.
              </p>
            </div>
          </CreativeCard>
        ) : (
          <div className="border border-[var(--rule)] rounded-[4px] divide-y divide-[var(--rule)]">
            {filtered.map((s) => {
              const meta = SIGNAL_META[s.signal_type];
              const Icon = meta.icon;
              return (
                <div key={s.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <Icon
                      className="w-3.5 h-3.5 text-[var(--ink-muted)] mt-1 flex-shrink-0"
                      strokeWidth={1.5}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        {severityChip(s.severity)}
                        <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                          {meta.label}
                        </span>
                        <span className="text-[var(--ink-subtle)]">·</span>
                        {s.contact_id ? (
                          <Link
                            href={`/client-details-overview?id=${s.contact_id}`}
                            className="text-sm text-[var(--ink)] font-medium hover:underline underline-offset-2"
                          >
                            {s.contact_name || "(unnamed contact)"}
                          </Link>
                        ) : (
                          <span className="text-sm text-[var(--ink)] font-medium">
                            {s.contact_name || "(unnamed contact)"}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-[var(--ink)] mt-1">
                        {s.title}
                      </div>
                      {s.summary && (
                        <p className="text-xs text-[var(--ink-muted)] mt-1.5 leading-relaxed">
                          {s.summary}
                        </p>
                      )}
                      {s.citations.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {s.citations.slice(0, 5).map((c, i) => (
                            <span
                              key={i}
                              className="text-[10px] mono text-[var(--ink-subtle)] px-1.5 py-0.5 rounded-[2px]"
                              style={{ border: "1px solid var(--rule)" }}
                              title={c.id}
                            >
                              {c.label}
                            </span>
                          ))}
                          {s.citations.length > 5 && (
                            <span className="text-[10px] text-[var(--ink-subtle)] mono">
                              +{s.citations.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Link
                        href={`/client-details-overview?id=${s.contact_id}#holdings`}
                        className="inline-flex items-center gap-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] px-2 py-1 rounded-[4px] hover:bg-[var(--canvas-subtle)]"
                      >
                        Open <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                      </Link>
                      <button
                        onClick={() => dismiss(s.id)}
                        className="p-1 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                        title="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
