"use client";

// AnalyticsClient — workspace analytics dashboard.
//
// Four sections:
//   1. Top-line KPIs (contacts, properties, workflows, conversations)
//   2. Pipeline breakdown (contacts by stage)
//   3. Workflow health (runs this month, success rate)
//   4. Spend trend (this month vs last)

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Building2,
  Workflow,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  AlertCircle,
  DollarSign,
  ArrowRight,
  Activity,
} from "lucide-react";

interface AnalyticsData {
  contacts: {
    total: number;
    by_stage: Array<{ stage: string; count: number }>;
    new_this_month: number;
    new_last_month: number;
  };
  properties: {
    total: number;
    by_status: Array<{ status: string; count: number }>;
    new_this_month: number;
    new_last_month: number;
  };
  workflows: {
    total: number;
    runs_this_month: number;
    runs_last_month: number;
    runs_by_status: Record<string, number>;
  };
  conversations: {
    total: number;
    this_month: number;
  };
  usage: {
    cost_cents_this_month: number;
    cost_cents_last_month: number;
  };
}

interface WorkflowStats {
  total_runs: number;
  success_rate: number;
  avg_duration_ms: number;
  error_runs: number;
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function delta(current: number, previous: number): { pct: number; direction: "up" | "down" | "flat" } {
  if (previous === 0) return { pct: current > 0 ? 100 : 0, direction: current > 0 ? "up" : "flat" };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

export default function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [wfStats, setWfStats] = useState<WorkflowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, wfRes] = await Promise.all([
        fetch("/api/me/analytics"),
        fetch("/api/dante/workflows/stats"),
      ]);

      if (!analyticsRes.ok) {
        const e = await analyticsRes.json();
        setError(e.error || "Failed to load analytics");
        return;
      }

      const analyticsData = await analyticsRes.json();
      setData(analyticsData);

      if (wfRes.ok) {
        const wfData = await wfRes.json();
        setWfStats(wfData);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Header */}
      <div className="border-b border-[var(--rule)] bg-[var(--canvas)]">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            </Link>
            <span className="heading-display text-xl text-[var(--ink)]">Analytics</span>
            <span className="label-section text-[var(--ink-muted)]">This month</span>
          </div>
          <Link
            href="/settings/usage"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Cost breakdown
            <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-[var(--ink-muted)] animate-spin" strokeWidth={1.5} />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" strokeWidth={1.5} />
            <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          </div>
        )}

        {data && !loading && (
          <>
            {/* ── Top-line KPIs ──────────────────────────────── */}
            <div>
              <p className="label-section text-[var(--ink-subtle)] mb-3">Overview</p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <KPICard
                  icon={Users}
                  label="Contacts"
                  value={data.contacts.total}
                  subValue={`+${data.contacts.new_this_month} this month`}
                  delta={delta(data.contacts.new_this_month, data.contacts.new_last_month)}
                />
                <KPICard
                  icon={Building2}
                  label="Properties"
                  value={data.properties.total}
                  subValue={`+${data.properties.new_this_month} this month`}
                  delta={delta(data.properties.new_this_month, data.properties.new_last_month)}
                />
                <KPICard
                  icon={Workflow}
                  label="Workflows"
                  value={data.workflows.total}
                  subValue={`${data.workflows.runs_this_month} runs`}
                  delta={delta(data.workflows.runs_this_month, data.workflows.runs_last_month)}
                />
                <KPICard
                  icon={MessageSquare}
                  label="Conversations"
                  value={data.conversations.total}
                  subValue={`${data.conversations.this_month} this month`}
                />
                <KPICard
                  icon={DollarSign}
                  label="AI spend"
                  value={fmtCents(data.usage.cost_cents_this_month)}
                  subValue="this month"
                  delta={delta(data.usage.cost_cents_this_month, data.usage.cost_cents_last_month)}
                  invertDelta
                />
              </div>
            </div>

            {/* ── Pipeline + Workflow Health ─────────────────── */}
            <div className="grid lg:grid-cols-2 gap-4">
              {/* Contact pipeline */}
              <div className="card-flat p-5">
                <p className="label-section text-[var(--ink-subtle)] mb-3">Contact pipeline</p>
                {data.contacts.by_stage && data.contacts.by_stage.length > 0 ? (
                  <div className="space-y-2">
                    {data.contacts.by_stage.map((s: { stage: string; count: number }) => (
                      <PipelineBar
                        key={s.stage}
                        label={s.stage}
                        count={s.count}
                        total={data.contacts.total}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {["lead", "prospect", "active", "inactive", "archived"].map((stage) => {
                      const ct = stage === "lead" ? data.contacts.total : 0;
                      return (
                        <PipelineBar
                          key={stage}
                          label={stage}
                          count={ct}
                          total={Math.max(data.contacts.total, 1)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Workflow health */}
              <div className="card-flat p-5">
                <p className="label-section text-[var(--ink-subtle)] mb-3">Workflow health (30d)</p>
                {wfStats ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <MiniStat label="Total runs" value={wfStats.total_runs} />
                      <MiniStat
                        label="Success rate"
                        value={`${Math.round(wfStats.success_rate * 100)}%`}
                        accent={wfStats.success_rate >= 0.9 ? "emerald" : wfStats.success_rate >= 0.7 ? "amber" : "red"}
                      />
                      <MiniStat
                        label="Avg duration"
                        value={
                          wfStats.avg_duration_ms < 1000
                            ? `${Math.round(wfStats.avg_duration_ms)}ms`
                            : `${(wfStats.avg_duration_ms / 1000).toFixed(1)}s`
                        }
                      />
                    </div>

                    {/* Run status breakdown */}
                    {data.workflows.runs_by_status && Object.keys(data.workflows.runs_by_status).length > 0 && (
                      <div>
                        <p className="text-xs text-[var(--ink-muted)] mb-2">This month by status</p>
                        <div className="flex gap-2 flex-wrap">
                          {Object.entries(data.workflows.runs_by_status).map(([status, count]) => (
                            <span
                              key={status}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono ${
                                status === "success"
                                  ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
                                  : status === "error"
                                    ? "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                                    : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)]"
                              }`}
                            >
                              {status}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--ink-muted)]">
                    No workflow data available yet.
                  </p>
                )}
              </div>
            </div>

            {/* ── Quick links ───────────────────────────────── */}
            <div className="card-flat p-5">
              <p className="label-section text-[var(--ink-subtle)] mb-3">Quick actions</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <QuickLink href="/contacts" icon={Users} label="View contacts" />
                <QuickLink href="/dante" icon={MessageSquare} label="Open Dante" />
                <QuickLink href="/settings/usage" icon={Activity} label="Cost breakdown" />
                <QuickLink href="/settings" icon={Workflow} label="Settings" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  subValue,
  delta: d,
  invertDelta,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  subValue: string;
  delta?: { pct: number; direction: "up" | "down" | "flat" };
  invertDelta?: boolean;
}) {
  return (
    <div className="card-flat p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4 text-[var(--ink-subtle)]" strokeWidth={1.5} />
        {d && d.direction !== "flat" && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
              (d.direction === "up" && !invertDelta) || (d.direction === "down" && invertDelta)
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {d.direction === "up" ? (
              <TrendingUp className="w-3 h-3" strokeWidth={1.5} />
            ) : (
              <TrendingDown className="w-3 h-3" strokeWidth={1.5} />
            )}
            {d.pct}%
          </span>
        )}
        {d && d.direction === "flat" && (
          <Minus className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
        )}
      </div>
      <div className="text-2xl font-mono font-semibold text-[var(--ink)]">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-[var(--ink-muted)] mt-0.5">{label}</div>
      <div className="text-[10px] text-[var(--ink-subtle)] mt-0.5">{subValue}</div>
    </div>
  );
}

function PipelineBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const stageColors: Record<string, string> = {
    lead: "bg-blue-500",
    prospect: "bg-indigo-500",
    active: "bg-emerald-500",
    inactive: "bg-amber-500",
    archived: "bg-gray-400 dark:bg-gray-600",
  };
  const barColor = stageColors[label.toLowerCase()] || "bg-[var(--accent)]";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--ink-muted)] w-20 shrink-0 capitalize">
        {label}
      </span>
      <div className="flex-1 h-5 bg-[var(--canvas-subtle)] rounded overflow-hidden">
        <div
          className={`h-full ${barColor} rounded transition-all`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-[var(--ink)] w-10 text-right">
        {count}
      </span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "emerald" | "amber" | "red";
}) {
  const colors = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="text-center">
      <div
        className={`text-xl font-mono font-semibold ${
          accent ? colors[accent] : "text-[var(--ink)]"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] text-[var(--ink-muted)] mt-0.5">{label}</div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Users;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2.5 rounded-[4px] bg-[var(--canvas-subtle)] hover:bg-[var(--accent-soft)] text-sm text-[var(--ink-muted)] hover:text-[var(--accent)] transition"
    >
      <Icon className="w-4 h-4" strokeWidth={1.5} />
      {label}
    </Link>
  );
}
