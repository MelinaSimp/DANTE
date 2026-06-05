"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Activity, CheckCircle2, AlertTriangle, XCircle,
  Clock, Zap, TrendingUp, BarChart3, RefreshCw,
  Lightbulb, ArrowRight, Gauge, ShieldAlert, Database, GitBranch,
} from "lucide-react";

interface Summary {
  total_workflows: number;
  active_workflows: number;
  total_runs_30d: number;
  success_runs: number;
  error_runs: number;
  cancelled_runs: number;
  success_rate: number;
  avg_duration_ms: number;
}

interface OptimizationSuggestion {
  type: "slow_step" | "high_failure" | "cache_candidate" | "unused_branch" | "constant_output";
  severity: "info" | "warning" | "critical";
  workflow_id: string;
  workflow_name: string;
  step_id?: string;
  step_name?: string;
  step_type?: string;
  message: string;
  detail: string;
}

interface OptimizationData {
  suggestions: OptimizationSuggestion[];
  analyzed: number;
  workflows_analyzed: number;
  period: string;
}

interface DailyCount {
  date: string;
  success: number;
  error: number;
  total: number;
}

interface WorkflowHealth {
  id: string;
  name: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  total_runs: number;
  success_count: number;
  error_count: number;
  success_rate: number | null;
  avg_duration_ms: number;
  consecutive_failures: number;
  last_error: string | null;
  last_error_at: string | null;
}

interface StatsData {
  summary: Summary;
  daily: DailyCount[];
  workflows: WorkflowHealth[];
  needs_attention: WorkflowHealth[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60000) return "just now";
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HealthDashboard() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [optData, setOptData] = useState<OptimizationData | null>(null);
  const [optLoading, setOptLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dante/workflows/stats", { credentials: "include" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const loadOptimizations = async () => {
    setOptLoading(true);
    try {
      const res = await fetch("/api/dante/workflows/optimize", { credentials: "include" });
      if (res.ok) setOptData(await res.json());
    } finally {
      setOptLoading(false);
    }
  };

  useEffect(() => { load(); loadOptimizations(); }, []);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <RefreshCw className="w-5 h-5 text-[var(--ink-muted)] animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <p className="text-[var(--ink-muted)] text-sm">Failed to load dashboard data.</p>
      </div>
    );
  }

  const { summary, daily, workflows, needs_attention } = data;
  const maxDaily = Math.max(...daily.map((d) => d.total), 1);

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center h-[50px] px-6 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <Link href="/dante/workflows"
          className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition mr-3">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
        </Link>
        <Activity className="w-4 h-4 text-[var(--ink-muted)] mr-2" strokeWidth={1.5} />
        <h1 className="text-sm font-semibold text-[var(--ink)]">Workflow Operations</h1>
        <span className="text-[10px] text-[var(--ink-subtle)] ml-2 mt-px">Last 30 days</span>
        <div className="flex-1" />
        <button onClick={load} disabled={loading}
          className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={1.5} />
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Alert banner */}
        {needs_attention.length > 0 && (
          <div className="bg-[var(--danger-soft)] border border-[var(--danger)]/20 rounded-[8px] px-5 py-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-[var(--danger)]" strokeWidth={2} />
              <span className="text-sm font-semibold text-[var(--danger)]">
                {needs_attention.length} workflow{needs_attention.length !== 1 ? "s" : ""} need attention
              </span>
            </div>
            <div className="space-y-1 mt-2">
              {needs_attention.map((w) => (
                <div key={w.id} className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                  <XCircle className="w-3 h-3 text-[var(--danger)] shrink-0" strokeWidth={2} />
                  <Link href={`/dante/workflows/${w.id}`} className="font-medium text-[var(--ink)] hover:underline">
                    {w.name}
                  </Link>
                  <span>-- {w.consecutive_failures} consecutive failures</span>
                  {w.last_error && (
                    <span className="truncate max-w-[300px] text-[var(--danger)]">{w.last_error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-4">
          <StatCard
            label="Active workflows"
            value={summary.active_workflows}
            sub={`${summary.total_workflows} total`}
            icon={<Zap className="w-4 h-4" strokeWidth={1.5} />}
          />
          <StatCard
            label="Total runs"
            value={summary.total_runs_30d}
            sub="last 30 days"
            icon={<BarChart3 className="w-4 h-4" strokeWidth={1.5} />}
          />
          <StatCard
            label="Success rate"
            value={`${summary.success_rate}%`}
            sub={`${summary.success_runs} succeeded`}
            icon={<TrendingUp className="w-4 h-4" strokeWidth={1.5} />}
            accent={summary.success_rate >= 90 ? "verified" : summary.success_rate >= 70 ? "flag" : "danger"}
          />
          <StatCard
            label="Failed runs"
            value={summary.error_runs}
            sub={`${summary.cancelled_runs} cancelled`}
            icon={<XCircle className="w-4 h-4" strokeWidth={1.5} />}
            accent={summary.error_runs > 0 ? "danger" : undefined}
          />
          <StatCard
            label="Avg duration"
            value={formatDuration(summary.avg_duration_ms)}
            sub="per execution"
            icon={<Clock className="w-4 h-4" strokeWidth={1.5} />}
          />
        </div>

        {/* Daily chart */}
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[10px] p-5">
          <h2 className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider mb-4">
            Daily executions (14 days)
          </h2>
          <div className="flex items-end gap-1.5" style={{ height: 120 }}>
            {daily.map((d) => {
              const successH = maxDaily > 0 ? (d.success / maxDaily) * 100 : 0;
              const errorH = maxDaily > 0 ? (d.error / maxDaily) * 100 : 0;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.total} runs (${d.success} ok, ${d.error} failed)`}>
                  <div className="w-full flex flex-col justify-end" style={{ height: 100 }}>
                    {d.error > 0 && (
                      <div className="w-full rounded-t-[2px]" style={{ height: `${errorH}%`, background: "var(--danger)", minHeight: d.error > 0 ? 3 : 0 }} />
                    )}
                    {d.success > 0 && (
                      <div className="w-full" style={{
                        height: `${successH}%`,
                        background: "var(--verified)",
                        minHeight: d.success > 0 ? 3 : 0,
                        borderRadius: d.error > 0 ? "0" : "2px 2px 0 0",
                      }} />
                    )}
                    {d.total === 0 && (
                      <div className="w-full rounded-[2px]" style={{ height: 3, background: "var(--rule)" }} />
                    )}
                  </div>
                  <span className="text-[8px] text-[var(--ink-subtle)] tabular-nums">
                    {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--ink-muted)]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--verified)" }} /> Success
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--danger)" }} /> Error
            </span>
          </div>
        </div>

        {/* Optimization suggestions */}
        <OptimizationPanel data={optData} loading={optLoading} onRefresh={loadOptimizations} />

        {/* Per-workflow table */}
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[10px] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--rule)]">
            <h2 className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
              Per-workflow breakdown
            </h2>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--rule)] text-[var(--ink-muted)]">
                <th className="text-left px-5 py-2 font-medium">Workflow</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-right px-3 py-2 font-medium">Runs</th>
                <th className="text-right px-3 py-2 font-medium">Success</th>
                <th className="text-right px-3 py-2 font-medium">Errors</th>
                <th className="text-right px-3 py-2 font-medium">Rate</th>
                <th className="text-right px-3 py-2 font-medium">Avg time</th>
                <th className="text-right px-5 py-2 font-medium">Last run</th>
              </tr>
            </thead>
            <tbody>
              {workflows
                .sort((a, b) => b.total_runs - a.total_runs)
                .map((w) => (
                <tr key={w.id} className="border-b border-[var(--rule)] last:border-0 hover:bg-[var(--canvas-subtle)] transition">
                  <td className="px-5 py-2.5">
                    <Link href={`/dante/workflows/${w.id}`} className="font-medium text-[var(--ink)] hover:underline">
                      {w.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    {w.consecutive_failures >= 3 ? (
                      <span className="flex items-center gap-1 text-[var(--danger)]">
                        <XCircle className="w-3 h-3" strokeWidth={2} /> Failing
                      </span>
                    ) : w.enabled ? (
                      <span className="flex items-center gap-1 text-[var(--verified)]">
                        <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> Active
                      </span>
                    ) : (
                      <span className="text-[var(--ink-subtle)]">Disabled</span>
                    )}
                  </td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-[var(--ink)]">{w.total_runs}</td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-[var(--verified)]">{w.success_count}</td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-[var(--danger)]">{w.error_count || "--"}</td>
                  <td className="text-right px-3 py-2.5 tabular-nums">
                    {w.success_rate != null ? (
                      <span className={
                        w.success_rate >= 90 ? "text-[var(--verified)]" :
                        w.success_rate >= 70 ? "text-[var(--flag)]" :
                        "text-[var(--danger)]"
                      }>
                        {w.success_rate}%
                      </span>
                    ) : "--"}
                  </td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-[var(--ink-muted)]">
                    {w.avg_duration_ms > 0 ? formatDuration(w.avg_duration_ms) : "--"}
                  </td>
                  <td className="text-right px-5 py-2.5 text-[var(--ink-muted)]">
                    {formatDate(w.last_run_at)}
                  </td>
                </tr>
              ))}
              {workflows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-[var(--ink-muted)]">
                    No workflows yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  accent?: "verified" | "danger" | "flag";
}) {
  const colorClass = accent === "verified" ? "text-[var(--verified)]"
    : accent === "danger" ? "text-[var(--danger)]"
    : accent === "flag" ? "text-[var(--flag)]"
    : "text-[var(--ink)]";

  return (
    <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[10px] px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--ink-muted)]">{icon}</span>
        <span className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${colorClass}`}>{value}</div>
      <div className="text-[10px] text-[var(--ink-subtle)] mt-0.5">{sub}</div>
    </div>
  );
}

// ── Optimization panel ──────────────────────────────────────────

const SUGGESTION_ICON: Record<string, React.ReactNode> = {
  slow_step: <Gauge className="w-3.5 h-3.5" strokeWidth={1.5} />,
  high_failure: <ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.5} />,
  cache_candidate: <Database className="w-3.5 h-3.5" strokeWidth={1.5} />,
  unused_branch: <GitBranch className="w-3.5 h-3.5" strokeWidth={1.5} />,
  constant_output: <Database className="w-3.5 h-3.5" strokeWidth={1.5} />,
};

const SEVERITY_STYLE: Record<string, { border: string; bg: string; badge: string; text: string }> = {
  critical: {
    border: "border-[var(--danger)]/30",
    bg: "bg-[var(--danger-soft)]",
    badge: "bg-[var(--danger)] text-white",
    text: "text-[var(--danger)]",
  },
  warning: {
    border: "border-[var(--flag)]/30",
    bg: "bg-[var(--flag-soft)]",
    badge: "bg-[var(--flag)] text-white",
    text: "text-[var(--flag)]",
  },
  info: {
    border: "border-[var(--accent)]/20",
    bg: "bg-[var(--accent-soft)]",
    badge: "bg-[var(--accent)] text-white",
    text: "text-[var(--accent)]",
  },
};

function OptimizationPanel({
  data,
  loading,
  onRefresh,
}: {
  data: OptimizationData | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[10px] overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--rule)] flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
        <h2 className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
          Optimization suggestions
        </h2>
        <span className="text-[10px] text-[var(--ink-subtle)] ml-1">Last 14 days</span>
        <div className="flex-1" />
        {data && (
          <span className="text-[10px] text-[var(--ink-subtle)]">
            {data.analyzed} runs across {data.workflows_analyzed} workflow{data.workflows_analyzed !== 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} strokeWidth={1.5} />
        </button>
      </div>

      {loading && !data && (
        <div className="px-5 py-8 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 text-[var(--ink-muted)] animate-spin" />
        </div>
      )}

      {data && data.suggestions.length === 0 && (
        <div className="px-5 py-8 text-center">
          <CheckCircle2 className="w-5 h-5 text-[var(--verified)] mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-sm text-[var(--ink-muted)]">No optimization issues found.</p>
          <p className="text-[10px] text-[var(--ink-subtle)] mt-1">
            All workflows are running within normal parameters.
          </p>
        </div>
      )}

      {data && data.suggestions.length > 0 && (
        <div className="divide-y divide-[var(--rule)]">
          {data.suggestions.map((s, i) => {
            const style = SEVERITY_STYLE[s.severity] || SEVERITY_STYLE.info;
            const isOpen = expanded.has(i);
            return (
              <div key={i}>
                <button
                  onClick={() => toggle(i)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--canvas-subtle)] transition"
                >
                  <span className={style.text}>
                    {SUGGESTION_ICON[s.type] || <Lightbulb className="w-3.5 h-3.5" strokeWidth={1.5} />}
                  </span>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[3px] shrink-0 ${style.badge}`}>
                    {s.severity}
                  </span>
                  <span className="text-xs text-[var(--ink)] flex-1 truncate">{s.message}</span>
                  <span className="text-[10px] text-[var(--ink-subtle)] shrink-0">{s.workflow_name}</span>
                  <ArrowRight
                    className={`w-3 h-3 text-[var(--ink-subtle)] transition-transform ${isOpen ? "rotate-90" : ""}`}
                    strokeWidth={1.5}
                  />
                </button>
                {isOpen && (
                  <div className={`mx-5 mb-3 px-4 py-3 rounded-[6px] border ${style.border} ${style.bg}`}>
                    <p className="text-xs text-[var(--ink)] leading-relaxed">{s.detail}</p>
                    {s.step_name && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-[var(--ink-muted)]">
                          Step: <span className="font-medium text-[var(--ink)]">{s.step_name}</span>
                        </span>
                        {s.step_type && (
                          <span className="text-[9px] text-[var(--ink-subtle)] bg-[var(--canvas)] px-1.5 py-0.5 rounded-[3px] border border-[var(--rule)]">
                            {s.step_type}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-2">
                      <Link
                        href={`/dante/workflows/${s.workflow_id}`}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--accent)] hover:underline"
                      >
                        Open workflow <ArrowRight className="w-2.5 h-2.5" strokeWidth={2} />
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
  );
}
