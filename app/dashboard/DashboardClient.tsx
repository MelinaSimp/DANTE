"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Target, AlertTriangle, TrendingUp, Users, DollarSign, Activity, Zap, X, Check, ShieldCheck, ArrowRight } from "lucide-react";
import { motion, Variants, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

const container: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4 } },
};

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

function MetricCard({ label, value, sub, icon: Icon, accent = "emerald" }: {
  label: string; value: string | number; sub: React.ReactNode;
  icon: React.ElementType; accent?: "emerald" | "zinc" | "amber" | "rose";
}) {
  const accentMap = {
    emerald: { iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
    zinc: { iconBg: "bg-zinc-500/10", iconColor: "text-zinc-400" },
    amber: { iconBg: "bg-amber-500/10", iconColor: "text-amber-400" },
    rose: { iconBg: "bg-rose-500/10", iconColor: "text-rose-400" },
  };
  const a = accentMap[accent];

  return (
    <div className="group relative">
      <div className="border border-zinc-700 bg-zinc-900/70 rounded-xl p-6 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-900/90 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium uppercase tracking-tight text-zinc-600">{label}</span>
          <div className={`p-2 rounded-lg ${a.iconBg} transition-colors duration-200`}>
            <Icon className={`h-4 w-4 ${a.iconColor}`} strokeWidth={1.5} />
          </div>
        </div>
        <div className="text-3xl font-bold tracking-tight text-zinc-50 leading-none">{value}</div>
        <div className="mt-3">{sub}</div>
      </div>
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
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-10 pb-16 max-w-[1600px] mx-auto"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-full px-3 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Live</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-50 leading-none">Executive Summary</h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-2xl">Portfolio intelligence and revenue signals across your book of business.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/agents" className="group inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/70 px-4 text-xs font-medium text-zinc-400 transition-colors duration-200 hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-600">
            <ShieldCheck className="mr-2 h-4 w-4 text-zinc-500" strokeWidth={1.5} />
            Agents
          </Link>
          <Link href="/dashboard/copilot" className="group inline-flex h-9 items-center justify-center rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white transition-colors duration-200 hover:bg-emerald-500">
            Copilot
            <ArrowRight className="ml-2 h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
      </div>

      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Total AUM"
          value={metrics.aum}
          accent="emerald"
          icon={DollarSign}
          sub={
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 bg-white/[0.03] ring-1 ring-white/[0.05] rounded-full px-2 py-0.5">
              {metrics.aumChange.startsWith("No") ? metrics.aumChange : <><TrendingUp className="h-3 w-3 text-emerald-400" strokeWidth={1.5} />{metrics.aumChange}</>}
            </span>
          }
        />
        <MetricCard
          label="Active Clients"
          value={metrics.activeClients}
          accent="emerald"
          icon={Users}
          sub={
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-zinc-500/10 ring-1 ring-zinc-500/20 rounded-full px-2 py-0.5">
              +{metrics.prospects} in pipeline
            </span>
          }
        />
        <MetricCard
          label="Detected Revenue"
          value={metrics.revenueOpportunities}
          accent="emerald"
          icon={Target}
          sub={
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded-full px-2 py-0.5">
              Live opportunities
            </span>
          }
        />
        <MetricCard
          label="Churn Risk"
          value={metrics.churnRisk}
          accent="emerald"
          icon={Activity}
          sub={
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 ring-1 ring-red-500/20 rounded-full px-2 py-0.5">
              Needs contact
            </span>
          }
        />
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-7">
        <motion.div variants={item} className="lg:col-span-4">
          <div className="border border-zinc-700 bg-zinc-900/70 rounded-xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">AUM by Client</h2>
                <p className="text-xs text-zinc-600 mt-0.5">Point-in-time snapshot across book of business</p>
              </div>
              <span className="text-xs font-medium text-zinc-600">Realtime</span>
            </div>
            <div className="flex-1 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData ?? []} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} dy={8} />
                  <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}M`} dx={-8} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0c0c0e", borderColor: "rgba(255,255,255,0.08)", borderRadius: "12px", color: "white", fontSize: "12px", boxShadow: "0 20px 60px -15px rgba(0,0,0,0.5)" }}
                    itemStyle={{ color: "#34d399" }}
                    formatter={(value) => [`$${Number(value ?? 0)}M`, "AUM"]}
                  />
                  <Area type="monotone" dataKey="aum" stroke="#34d399" fillOpacity={1} fill="url(#colorAum)" strokeWidth={1.5} activeDot={{ r: 5, fill: "#34d399", stroke: "#0c0c0e", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="lg:col-span-3">
          <div className="border border-zinc-700 bg-zinc-900/70 rounded-xl p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Priority Actions</h2>
                <p className="text-xs text-zinc-600 mt-0.5">AI-flagged items requiring review</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-3.5 min-h-[280px] max-h-[360px] pr-1">
              {alerts.length === 0 && (
                <div className="flex h-full items-center justify-center text-sm text-zinc-600">No pressing alerts.</div>
              )}
              {alerts.map((alert) => (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={alert.id}
                  className="flex flex-col gap-3 p-5 rounded-lg border border-zinc-700 bg-zinc-900/70 hover:border-zinc-600 hover:bg-zinc-900/80 transition-colors duration-200 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {alert.severity === "critical" ? (
                        <div className="p-1 bg-red-500/10 rounded-md"><AlertTriangle className="h-3.5 w-3.5 text-red-400" strokeWidth={1.5} /></div>
                      ) : alert.severity === "high" ? (
                        <div className="p-1 bg-amber-500/10 rounded-md"><TrendingUp className="h-3.5 w-3.5 text-amber-400" strokeWidth={1.5} /></div>
                      ) : (
                        <div className="p-1 bg-emerald-500/10 rounded-md"><Target className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.5} /></div>
                      )}
                      <span className="text-sm font-medium text-zinc-200">{alert.title}</span>
                    </div>
                    <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"} className={`text-xs font-medium ${alert.severity === "critical" ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-500 pl-6 leading-relaxed">
                    <span className="font-medium text-zinc-400">{alert.client}: </span>
                    {alert.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div variants={item}>
        <div className="border border-zinc-700 bg-zinc-900/70 rounded-xl">
          <div className="flex items-center justify-between p-6 pb-5 border-b border-zinc-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Zap className="h-4 w-4 text-amber-400" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Revenue Engine</h2>
                <p className="text-xs text-zinc-600 mt-0.5">Draft opportunities awaiting advisor action</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-medium text-zinc-500 bg-zinc-900 border-zinc-700 rounded-full">{revenueEngine.length} drafts</Badge>
          </div>
          <div className="p-6 pt-5">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {revenueEngine.length === 0 && (
                <div className="col-span-full py-12 text-center text-sm text-zinc-600">No draft opportunities available.</div>
              )}
              <AnimatePresence>
                {revenueEngine.map((opp) => (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={opp.id}
                    className="flex flex-col justify-between min-h-[200px] p-5 rounded-lg border border-zinc-700 bg-zinc-900/70 hover:border-zinc-600 hover:bg-zinc-900/90 transition-colors duration-200 overflow-hidden"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs font-medium">{opp.type}</Badge>
                        <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-full">{opp.confidence}%</span>
                      </div>
                      <h3 className="text-base font-semibold text-zinc-100">{opp.client}</h3>
                      <div className="text-2xl font-bold text-zinc-50 mt-0.5">{opp.value}</div>
                      <p className="text-xs text-zinc-500 mt-3 leading-relaxed line-clamp-2">{opp.suggestedAction}</p>
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button
                        onClick={() => handleDismiss(opp.id)}
                        className="flex-1 h-8 flex items-center justify-center gap-1 text-zinc-400 text-xs font-medium border border-zinc-700 rounded-md hover:text-red-400 hover:border-red-500/30 transition-colors"
                      >
                        <X className="h-4 w-4" strokeWidth={1.5} /> Dismiss
                      </button>
                      <button
                        onClick={() => handleApprove(opp.id)}
                        className="flex-1 h-8 flex items-center justify-center gap-1 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-500 transition-colors"
                      >
                        <Check className="h-4 w-4" strokeWidth={1.5} /> Approve
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
