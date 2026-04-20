"use client";

import React from "react";
import Link from "next/link";
import { Target, AlertTriangle, TrendingUp, Users, DollarSign, Activity, Zap, X, Check, ShieldCheck, ArrowRight } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Alert {
  id: string;
  title: string;
  client: string;
  description: string;
  severity: string;
  timestamp: Date;
  type?: string;
}

interface RevenueOpportunity {
  id: string;
  type: string;
  client: string;
  value: string;
  confidence: number;
  suggestedAction: string;
}

interface ChartItem {
  name: string;
  aum: number;
  type: string;
}

interface DashboardProps {
  metrics: {
    aum: string;
    aumChange: string;
    activeClients: number;
    prospects: number;
    revenueOpportunities: string;
    churnRisk: number;
    taxReviewPending?: number;
    meetingsThisWeek?: number;
    tasksDue?: number;
    complianceFlags?: number;
  };
  alerts: Alert[];
  revenueEngine: RevenueOpportunity[];
  chartData?: ChartItem[];
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub: React.ReactNode;
  icon: React.ElementType;
}) {
  return (
    <div className="card-flat p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="label-section">{label}</span>
        <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2">
          <Icon className="h-4 w-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
        </div>
      </div>
      <div className="heading-display text-4xl text-[var(--ink)] leading-none">{value}</div>
      <div className="mt-3">{sub}</div>
    </div>
  );
}

export function DashboardClient({ metrics, alerts, revenueEngine, chartData }: DashboardProps) {
  async function handleDismiss(id: string) {
    await fetch("/api/dashboard/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "dismiss" }),
    });
    window.location.reload();
  }

  async function handleApprove(id: string) {
    await fetch("/api/dashboard/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "approve" }),
    });
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-10 pb-16 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-[var(--verified-soft)] text-[var(--verified)] border border-[var(--verified)]/30">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--verified)]" />
              Live
            </span>
          </div>
          <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)] leading-tight">Executive summary</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-2 max-w-2xl">
            Portfolio intelligence and revenue signals across your book of business.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/agents"
            className="inline-flex h-9 items-center justify-center rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 text-xs font-medium text-[var(--ink-muted)] transition hover:bg-[var(--canvas-subtle)] hover:text-[var(--ink)]"
          >
            <ShieldCheck className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Agents
          </Link>
          <Link
            href="/dashboard/copilot"
            className="inline-flex h-9 items-center justify-center rounded-[4px] bg-[var(--ink)] px-4 text-xs font-semibold text-[var(--canvas)] transition hover:bg-[var(--ink)]/90"
          >
            Copilot
            <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Total AUM"
          value={metrics.aum}
          icon={DollarSign}
          sub={
            <span className="inline-flex items-center gap-1.5 mono text-[11px] text-[var(--ink-muted)]">
              {metrics.aumChange.startsWith("No") ? (
                metrics.aumChange
              ) : (
                <>
                  <TrendingUp className="h-3 w-3 text-[var(--verified)]" strokeWidth={1.5} />
                  {metrics.aumChange}
                </>
              )}
            </span>
          }
        />
        <MetricCard
          label="Active clients"
          value={metrics.activeClients}
          icon={Users}
          sub={
            <span className="mono text-[11px] text-[var(--ink-muted)]">
              +{metrics.prospects} in pipeline
            </span>
          }
        />
        <MetricCard
          label="Detected revenue"
          value={metrics.revenueOpportunities}
          icon={Target}
          sub={
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent)]/30 rounded-full px-2 py-0.5">
              Live opportunities
            </span>
          }
        />
        <MetricCard
          label="Churn risk"
          value={metrics.churnRisk}
          icon={Activity}
          sub={
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-full px-2 py-0.5">
              Needs contact
            </span>
          }
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-7">
        <div className="lg:col-span-4">
          <div className="card-flat p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="heading-display text-xl text-[var(--ink)]">AUM by client</h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Point-in-time snapshot across book of business
                </p>
              </div>
              <span className="label-section text-[var(--ink-subtle)]">Realtime</span>
            </div>
            <div className="flex-1 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData ?? []} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3166bf" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#3166bf" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                  <XAxis
                    dataKey="name"
                    stroke="rgba(0,0,0,0.35)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    dy={8}
                  />
                  <YAxis
                    stroke="rgba(0,0,0,0.35)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${value}M`}
                    dx={-8}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid rgba(0,0,0,0.1)",
                      borderRadius: "6px",
                      color: "#111",
                      fontSize: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                    itemStyle={{ color: "#3166bf" }}
                    formatter={(value) => [`$${Number(value ?? 0)}M`, "AUM"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="aum"
                    stroke="#3166bf"
                    fillOpacity={1}
                    fill="url(#colorAum)"
                    strokeWidth={1.5}
                    activeDot={{ r: 4, fill: "#3166bf", stroke: "#ffffff", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="card-flat p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="heading-display text-xl text-[var(--ink)]">Priority actions</h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  AI-flagged items requiring review
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--verified)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--verified)]" />
                Active
              </span>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-[280px] max-h-[360px] pr-1">
              {alerts.length === 0 && (
                <div className="flex h-full items-center justify-center text-sm text-[var(--ink-subtle)]">
                  No pressing alerts.
                </div>
              )}
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex flex-col gap-3 p-4 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] hover:bg-[var(--canvas-subtle)] transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {alert.severity === "critical" ? (
                        <div className="p-1 bg-[var(--danger-soft)] rounded-[4px]">
                          <AlertTriangle className="h-3.5 w-3.5 text-[var(--danger)]" strokeWidth={1.5} />
                        </div>
                      ) : alert.severity === "high" ? (
                        <div className="p-1 bg-[var(--flag-soft)] rounded-[4px]">
                          <TrendingUp className="h-3.5 w-3.5 text-[var(--flag)]" strokeWidth={1.5} />
                        </div>
                      ) : (
                        <div className="p-1 bg-[var(--verified-soft)] rounded-[4px]">
                          <Target className="h-3.5 w-3.5 text-[var(--verified)]" strokeWidth={1.5} />
                        </div>
                      )}
                      <span className="text-sm font-medium text-[var(--ink)]">{alert.title}</span>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        alert.severity === "critical"
                          ? "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/30"
                          : alert.severity === "high"
                          ? "bg-[var(--flag-soft)] text-[var(--flag)] border-[var(--flag)]/30"
                          : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border-[var(--rule)]"
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-muted)] pl-6 leading-relaxed">
                    <span className="font-medium text-[var(--ink)]">{alert.client}: </span>
                    {alert.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="card-flat">
          <div className="flex items-center justify-between p-6 pb-5 border-b border-[var(--rule)]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[var(--flag-soft)] rounded-[4px]">
                <Zap className="h-4 w-4 text-[var(--flag)]" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="heading-display text-xl text-[var(--ink)]">Revenue engine</h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Draft opportunities awaiting advisor action
                </p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full border border-[var(--rule)] bg-[var(--canvas)] px-2.5 py-0.5 mono text-[11px] text-[var(--ink-muted)]">
              {revenueEngine.length} drafts
            </span>
          </div>
          <div className="p-6 pt-5">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {revenueEngine.length === 0 && (
                <div className="col-span-full py-12 text-center text-sm text-[var(--ink-subtle)]">
                  No draft opportunities available.
                </div>
              )}
              {revenueEngine.map((opp) => (
                <div
                  key={opp.id}
                  className="flex flex-col justify-between min-h-[200px] p-5 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] hover:bg-[var(--canvas-subtle)] transition overflow-hidden"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="inline-flex items-center rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                        {opp.type}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[var(--verified)]/30 bg-[var(--verified-soft)] px-2 py-0.5 mono text-[11px] font-semibold text-[var(--verified)]">
                        {opp.confidence}%
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-[var(--ink)]">{opp.client}</h3>
                    <div className="heading-display text-3xl text-[var(--ink)] mt-0.5">{opp.value}</div>
                    <p className="text-xs text-[var(--ink-muted)] mt-3 leading-relaxed line-clamp-2">
                      {opp.suggestedAction}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => handleDismiss(opp.id)}
                      className="flex-1 h-8 flex items-center justify-center gap-1 text-[var(--ink-muted)] text-xs font-medium border border-[var(--rule)] rounded-[4px] hover:text-[var(--danger)] hover:border-[var(--danger)]/40 hover:bg-[var(--danger-soft)] transition"
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} /> Dismiss
                    </button>
                    <button
                      onClick={() => handleApprove(opp.id)}
                      className="flex-1 h-8 flex items-center justify-center gap-1 bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium rounded-[4px] hover:bg-[var(--ink)]/90 transition"
                    >
                      <Check className="h-4 w-4" strokeWidth={1.5} /> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
