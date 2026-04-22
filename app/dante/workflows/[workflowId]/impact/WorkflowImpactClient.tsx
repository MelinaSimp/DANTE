"use client";

// app/dante/workflows/[workflowId]/impact/WorkflowImpactClient.tsx
//
// "What has this workflow actually done?" — a per-workflow impact view
// derived from run logs. Headline numbers, risk distribution of
// touched contacts, and a list of the contacts themselves with
// last_touch + current risk.
//
// Deliberately honest about what it does and doesn't know: we show
// current risk (from the latest brief) rather than risk-at-time-of-
// touch, because we don't snapshot briefs yet. The page surfaces that
// caveat inline — no fake precision.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Users, Mail, Edit3, Search,
  Flame, AlertTriangle, TrendingDown, ShieldCheck, Info,
  ExternalLink,
} from "lucide-react";

interface ImpactContact {
  contact_id: string;
  name: string | null;
  email: string | null;
  first_touched_at: string | null;
  last_touched_at: string | null;
  touch_count: number;
  current_risk: string | null;
  last_brief_at: string | null;
  actions: {
    queried: number;
    updated: number;
    emailed: number;
  };
}

interface ImpactSummary {
  total_runs_considered: number;
  successful_runs: number;
  errored_runs: number;
  unique_contacts_touched: number;
  total_updates: number;
  total_emails_simulated_or_sent: number;
  runs_with_no_contacts: number;
  risk_distribution: {
    critical: number;
    act_now: number;
    watch: number;
    healthy: number;
    unknown: number;
  };
}

interface ImpactResponse {
  workflow: { id: string; name: string; description: string | null };
  summary: ImpactSummary;
  contacts: ImpactContact[];
  caveats: { note: string; email_attribution: string };
}

function riskIcon(risk: string | null) {
  switch (risk) {
    case "critical": return { Icon: Flame, cls: "text-[var(--danger)]" };
    case "act_now":  return { Icon: AlertTriangle, cls: "text-[var(--accent)]" };
    case "watch":    return { Icon: TrendingDown, cls: "text-[var(--ink-muted)]" };
    case "healthy":  return { Icon: ShieldCheck, cls: "text-[var(--verified)]" };
    default:         return { Icon: Info, cls: "text-[var(--ink-subtle)]" };
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function WorkflowImpactClient({ workflowId }: { workflowId: string }) {
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const html = document.documentElement, body = document.body;
    html.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("color", "var(--ink)", "important");
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/dante/workflows/${workflowId}/impact`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load impact");
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally { setLoading(false); }
    })();
  }, [workflowId]);

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <Link href={`/dante/workflows/${workflowId}`} className="flex items-center gap-1.5 px-2 py-1 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] text-sm">
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
            Editor
          </Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Impact</span>
        </div>
        <Link
          href="/dante/workflows"
          className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">All workflows</span>
        </Link>
      </div>

      <div className="px-6 md:px-8 py-8 max-w-[1100px] mx-auto">
        {loading ? (
          <div className="card-flat p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-muted)] mx-auto" strokeWidth={1.5} />
          </div>
        ) : error ? (
          <div className="border border-[var(--rule)] bg-[var(--danger-soft)] rounded-[6px] p-4 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : data ? (
          <>
            <div className="mb-8">
              <div className="label-section mb-2">Workflow · Impact</div>
              <h1 className="heading-display text-3xl text-[var(--ink)] mb-1">{data.workflow.name}</h1>
              {data.workflow.description && (
                <p className="text-sm text-[var(--ink-muted)]">{data.workflow.description}</p>
              )}
            </div>

            {/* Headline metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard label="Runs considered" value={data.summary.total_runs_considered} sub={`${data.summary.successful_runs} ok · ${data.summary.errored_runs} err`} Icon={Search} />
              <StatCard label="Contacts touched" value={data.summary.unique_contacts_touched} sub="unique across all runs" Icon={Users} />
              <StatCard label="Contact updates" value={data.summary.total_updates} sub="write actions logged" Icon={Edit3} />
              <StatCard label="Emails" value={data.summary.total_emails_simulated_or_sent} sub="sent or simulated" Icon={Mail} />
            </div>

            {/* Risk distribution */}
            {data.summary.unique_contacts_touched > 0 && (
              <section className="card-flat p-5 mb-6">
                <div className="label-section mb-3">Risk mix of touched contacts</div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <RiskChip label="Critical" value={data.summary.risk_distribution.critical} risk="critical" />
                  <RiskChip label="Act now"  value={data.summary.risk_distribution.act_now}  risk="act_now" />
                  <RiskChip label="Watch"    value={data.summary.risk_distribution.watch}    risk="watch" />
                  <RiskChip label="Healthy"  value={data.summary.risk_distribution.healthy}  risk="healthy" />
                  <RiskChip label="No brief" value={data.summary.risk_distribution.unknown}  risk={null} />
                </div>
                <p className="mt-3 text-[11px] text-[var(--ink-subtle)] flex items-start gap-1.5">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={1.5} />
                  Current risk reflects the latest brief — we don&apos;t snapshot risk at time of touch, so this can&apos;t prove the workflow *moved* a contact from one tier to another.
                </p>
              </section>
            )}

            {/* Contacts list */}
            <section>
              <div className="label-section mb-3">
                Touched contacts {data.contacts.length > 0 && `(${data.contacts.length})`}
              </div>
              {data.contacts.length === 0 ? (
                <div className="card-flat p-10 text-center">
                  <Users className="h-8 w-8 text-[var(--ink-subtle)] mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm text-[var(--ink-muted)] mb-1">No contacts touched yet</p>
                  <p className="text-xs text-[var(--ink-subtle)]">
                    Once this workflow runs and queries, updates, or emails a contact, they&apos;ll show up here.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {data.contacts.map((c) => {
                    const { Icon, cls } = riskIcon(c.current_risk);
                    return (
                      <div key={c.contact_id} className="card-flat card-flat-hover flex items-center gap-4 px-4 py-3">
                        <Icon className={`h-4 w-4 shrink-0 ${cls}`} strokeWidth={1.5} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--ink)] truncate">
                              {c.name || c.email || c.contact_id.slice(0, 8)}
                            </span>
                            {c.current_risk && (
                              <span className="text-[10px] font-medium text-[var(--ink-muted)] uppercase tracking-wider">
                                {c.current_risk.replace("_", " ")}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--ink-subtle)]">
                            <span>Last touched {fmtDate(c.last_touched_at)}</span>
                            <span>·</span>
                            <span>
                              {c.actions.queried}q · {c.actions.updated}u · {c.actions.emailed}e
                            </span>
                          </div>
                        </div>
                        <Link
                          href={`/clients/${c.contact_id}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] text-[11px] font-medium transition"
                        >
                          Open <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
              {data.contacts.length > 0 && (
                <p className="mt-3 text-[11px] text-[var(--ink-subtle)]">
                  Action legend: <span className="mono">q</span> = queried, <span className="mono">u</span> = updated, <span className="mono">e</span> = emailed (attributed by email address; includes Test runs).
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, Icon,
}: {
  label: string; value: number; sub: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="card-flat p-4">
      <div className="flex items-center gap-1.5 text-[var(--ink-subtle)] mb-2">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-[var(--ink)] leading-none mb-1">{value}</div>
      <div className="text-[11px] text-[var(--ink-subtle)]">{sub}</div>
    </div>
  );
}

function RiskChip({
  label, value, risk,
}: { label: string; value: number; risk: string | null }) {
  const { Icon, cls } = riskIcon(risk);
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)]">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${cls}`} strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)]">{label}</div>
        <div className="text-sm font-semibold text-[var(--ink)]">{value}</div>
      </div>
    </div>
  );
}
