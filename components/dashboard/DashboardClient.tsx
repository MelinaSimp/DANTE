"use client";

import React from "react";
import {
  Target,
  AlertTriangle,
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  Zap,
  Bot,
  Calendar,
  MessageSquare,
  Sparkles,
  ThumbsUp,
  X,
  CheckCircle2,
  Lightbulb,
  CheckCircle,
  Shield,
  Clock,
} from "lucide-react";
import { motion, Variants, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CountUp } from "@/components/ui/count-up";

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
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
  timestamp: string;
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

interface DashboardMetrics {
  aum: string;
  aumChange: string;
  activeClients: number;
  prospects: number;
  revenueOpportunities: string;
  churnRisk: number;
  deployedAgents: number;
  totalAgents: number;
  totalConversations: number;
  automationEvents: number;
}

interface AiOutput {
  id: string;
  title: string;
  type: string;
  summary: string;
  review_status: string;
  linked_client: string | null;
  created_at: string;
  wm_agent_definitions?: { name: string };
}

interface AiTask {
  id: string;
  description: string;
  status: string;
  linked_client: string | null;
  wm_agent_definitions?: { name: string };
}

interface AutoAgentSummary {
  id: string;
  name: string;
  purpose: string;
  status: string;
  icon: string;
  color_class: string;
  success_rate: number;
  outputs_today: number;
  pending_reviews: number;
  last_run: string | null;
}

interface MeetingPrepItem {
  id: string;
  contactName: string;
  scheduledAt: string;
  serviceType: string;
  status: string;
  notes: string | null;
}

interface DashboardProps {
  metrics: DashboardMetrics;
  alerts: Alert[];
  revenueEngine: RevenueOpportunity[];
  chartData: ChartItem[];
  agents?: AgentSummary[];
  autoAgents?: AutoAgentSummary[];
  aiOutputs?: AiOutput[];
  aiTasks?: AiTask[];
  meetingPrep?: MeetingPrepItem[];
  onReviewOutput?: (id: string, status: string) => void;
  onUpdateTask?: (id: string, status: string) => void;
}

interface AgentSummary {
  id: string;
  name: string;
  status: string;
  modality: string;
  conversations: { total: number; active: number; completed: number };
  successRate: number;
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "emerald",
  href,
}: {
  label: string;
  value: string | number;
  sub: React.ReactNode;
  icon: React.ElementType;
  accent?: "emerald" | "zinc" | "amber" | "rose" | "blue";
  href?: string;
}) {
  const accentMap = {
    emerald: { iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
    zinc: { iconBg: "bg-zinc-500/10", iconColor: "text-zinc-400" },
    amber: { iconBg: "bg-amber-500/10", iconColor: "text-amber-400" },
    rose: { iconBg: "bg-rose-500/10", iconColor: "text-rose-400" },
    blue: { iconBg: "bg-blue-500/10", iconColor: "text-blue-400" },
  };
  const a = accentMap[accent];

  const inner = (
    <div className={`border border-zinc-800 bg-zinc-950/80 rounded-xl p-6 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-950 shadow-sm ${href ? "cursor-pointer" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-tight text-zinc-600">
          {label}
        </span>
        <div
          className={`p-2 rounded-lg ${a.iconBg} transition-colors duration-200`}
        >
          <Icon
            className={`h-4 w-4 ${a.iconColor}`}
            strokeWidth={1.5}
          />
        </div>
      </div>
      <div className="text-3xl font-bold tracking-tight text-zinc-50 leading-none">
        <CountUp value={value} />
      </div>
      <div className="mt-3">{sub}</div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="group relative block">
        {inner}
      </a>
    );
  }

  return <div className="group relative">{inner}</div>;
}

const STATUS_DOTS: Record<string, string> = {
  deployed: "bg-emerald-500",
  draft: "bg-zinc-500",
  archived: "bg-amber-500",
};

const MODALITY_LABELS: Record<string, string> = {
  chat: "Chat",
  voice: "Voice",
  "multi-modal": "Multi-modal",
};

const OUTPUT_TYPE_STYLES: Record<string, string> = {
  insight: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  recommendation: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  alert: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  report: "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

function formatTimeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "now";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function DashboardClient({
  metrics,
  alerts,
  revenueEngine,
  chartData,
  agents = [],
  autoAgents = [],
  aiOutputs = [],
  aiTasks = [],
  meetingPrep = [],
  onReviewOutput,
  onUpdateTask,
}: DashboardProps) {
  const pendingOutputs = aiOutputs.filter((o) => o.review_status === "PENDING");
  const pendingTasks = aiTasks.filter((t) => t.status === "PENDING");
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-10 pb-16 max-w-[1600px] mx-auto"
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="rounded-full px-3 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Live
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-zinc-50 leading-none">
          Dashboard
        </h1>
        <p className="text-zinc-500 text-sm mt-2 max-w-2xl">
          CRM intelligence overview — contacts, agents, conversations, and
          revenue signals.
        </p>
      </div>

      {/* Metric Cards */}
      <motion.div
        variants={item}
        className="grid grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <MetricCard
          label="Total Revenue"
          value={metrics.aum}
          accent="emerald"
          icon={DollarSign}
          sub={
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 bg-[var(--canvas)]/[0.03] ring-1 ring-white/[0.05] rounded-full px-2 py-0.5">
              {metrics.aumChange.startsWith("No") ? (
                metrics.aumChange
              ) : (
                <>
                  <TrendingUp
                    className="h-3 w-3 text-emerald-400"
                    strokeWidth={1.5}
                  />
                  {metrics.aumChange}
                </>
              )}
            </span>
          }
        />
        <MetricCard
          label="Contacts"
          value={metrics.activeClients}
          accent="blue"
          icon={Users}
          sub={
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-zinc-500/10 ring-1 ring-zinc-500/20 rounded-full px-2 py-0.5">
              {metrics.prospects} upcoming appointments
            </span>
          }
        />
        <MetricCard
          label="Conversations"
          value={metrics.revenueOpportunities}
          accent="emerald"
          icon={MessageSquare}
          sub={
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded-full px-2 py-0.5">
              {metrics.totalConversations} total
            </span>
          }
        />
        <MetricCard
          label="Active Agents"
          value={`${metrics.deployedAgents}/${metrics.totalAgents}`}
          accent="amber"
          icon={Bot}
          href="/dashboard/agents"
          sub={
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-zinc-500/10 ring-1 ring-zinc-500/20 rounded-full px-2 py-0.5">
              {metrics.churnRisk} pending tasks
            </span>
          }
        />
      </motion.div>

      {/* Meeting Prep */}
      {meetingPrep.length > 0 && (
        <motion.div variants={item}>
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <Calendar className="h-4 w-4 text-cyan-400" strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">Upcoming Meetings</h2>
                  <p className="text-xs text-zinc-600 mt-0.5">Prep briefs for your next {meetingPrep.length} meeting{meetingPrep.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-cyan-400">
                <Clock className="h-3.5 w-3.5" />
                Auto-analyzed nightly
              </span>
            </div>
            <div className="p-5">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {meetingPrep.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col gap-3 p-4 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:border-cyan-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-zinc-200">{m.contactName}</span>
                      <span className="text-[11px] font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 rounded-full px-2 py-0.5">
                        in {formatTimeUntil(m.scheduledAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className="bg-zinc-800 rounded-full px-2 py-0.5">{m.serviceType}</span>
                      <span>·</span>
                      <span>{new Date(m.scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                      <span>·</span>
                      <span>{new Date(m.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    {m.notes && (
                      <p className="text-xs text-zinc-500 leading-relaxed border-t border-zinc-800/50 pt-2">{m.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main content — chart + alerts */}
      <div className="grid gap-8 lg:grid-cols-7">
        {/* Chart */}
        <motion.div variants={item} className="lg:col-span-4">
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">
                  Revenue by Month
                </h2>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Sales records aggregated monthly ($k)
                </p>
              </div>
              <span className="text-xs font-medium text-zinc-600">
                Current data
              </span>
            </div>
            <div style={{ width: "100%", height: 280 }}>
              {chartData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-zinc-600">
                  No revenue data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorAum"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#34d399"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#34d399"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(255,255,255,0.03)"
                    />
                    <XAxis
                      dataKey="name"
                      stroke="rgba(255,255,255,0.2)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      dy={8}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.2)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${value}k`}
                      dx={-8}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0c0c0e",
                        borderColor: "rgba(255,255,255,0.08)",
                        borderRadius: "12px",
                        color: "white",
                        fontSize: "12px",
                        boxShadow: "0 20px 60px -15px rgba(0,0,0,0.5)",
                      }}
                      itemStyle={{ color: "#34d399" }}
                      formatter={(value) => [
                        `$${Number(value ?? 0)}k`,
                        "Revenue",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="aum"
                      stroke="#34d399"
                      fillOpacity={1}
                      fill="url(#colorAum)"
                      strokeWidth={1.5}
                      activeDot={{
                        r: 5,
                        fill: "#34d399",
                        stroke: "#0c0c0e",
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </motion.div>

        {/* Priority Action Board */}
        <motion.div variants={item} className="lg:col-span-3">
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">
                  Priority Actions
                </h2>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Items requiring your attention
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-3.5 min-h-[280px] max-h-[360px] pr-1 scrollbar-thin scrollbar-thumb-white/[0.06]">
              {alerts.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                  All clear — no pressing alerts.
                </div>
              ) : null}
              {alerts.map((alert) => (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={alert.id}
                  className="flex flex-col gap-3 p-5 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:border-zinc-700 hover:bg-zinc-950 transition-colors duration-200 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {alert.severity === "critical" ? (
                        <div className="p-1 bg-red-500/10 rounded-md">
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-red-400"
                            strokeWidth={1.5}
                          />
                        </div>
                      ) : alert.severity === "high" ? (
                        <div className="p-1 bg-amber-500/10 rounded-md">
                          <TrendingUp
                            className="h-3.5 w-3.5 text-amber-400"
                            strokeWidth={1.5}
                          />
                        </div>
                      ) : (
                        <div className="p-1 bg-emerald-500/10 rounded-md">
                          <Target
                            className="h-3.5 w-3.5 text-emerald-400"
                            strokeWidth={1.5}
                          />
                        </div>
                      )}
                      <span className="text-sm font-medium text-zinc-200">
                        {alert.title}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        alert.severity === "critical"
                          ? "bg-red-500/10 text-red-400 border border-red-500/30"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 pl-6 leading-relaxed">
                    <span className="font-medium text-zinc-400">
                      {alert.client}:{" "}
                    </span>
                    {alert.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Revenue Engine */}
      {revenueEngine.length > 0 && (
        <motion.div variants={item}>
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl">
            <div className="flex items-center justify-between p-6 pb-5 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Zap
                    className="h-4 w-4 text-amber-400"
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">
                    Revenue Breakdown
                  </h2>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Top accounts by total revenue
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-full px-3 py-1">
                {revenueEngine.length} accounts
              </span>
            </div>
            <div className="p-6 pt-5">
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {revenueEngine.map((opp) => (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      key={opp.id}
                      className="flex flex-col justify-between min-h-[180px] p-5 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:border-zinc-700 hover:bg-zinc-950 transition-colors duration-200 overflow-hidden"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-medium px-2 py-0.5 rounded-full">
                            {opp.type}
                          </span>
                          <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-full">
                            {opp.confidence}%
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-zinc-100">
                          {opp.client}
                        </h3>
                        <div className="text-2xl font-bold text-zinc-50 mt-0.5">
                          {opp.value}
                        </div>
                        <p className="text-xs text-zinc-500 mt-3 leading-relaxed line-clamp-2">
                          {opp.suggestedAction}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Agent Roster — CRM + Autonomous merged */}
      {(agents.length > 0 || autoAgents.length > 0) && (
        <motion.div variants={item}>
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl">
            <div className="flex items-center justify-between p-6 pb-5 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Bot className="h-4 w-4 text-amber-400" strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">Your Agents</h2>
                  <p className="text-xs text-zinc-600 mt-0.5">{agents.length + autoAgents.length} agents across your workspace</p>
                </div>
              </div>
              <a
                href="/dashboard/agents"
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1"
              >
                View all <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
            <div className="p-5">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {agents.slice(0, 6).map((agent) => (
                  <a
                    key={agent.id}
                    href="/dashboard/agents"
                    className="flex items-center gap-3 p-4 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:border-zinc-700 hover:bg-zinc-950 transition-colors"
                  >
                    <div className="p-2 bg-zinc-800 rounded-lg shrink-0">
                      <Bot className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-zinc-200 truncate">{agent.name}</span>
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOTS[agent.status] || "bg-zinc-500"}`} />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-600">
                        <span>{MODALITY_LABELS[agent.modality] || agent.modality}</span>
                        <span>·</span>
                        <span>{agent.conversations.total} convos</span>
                        <span>·</span>
                        <span>{agent.successRate}% success</span>
                      </div>
                    </div>
                  </a>
                ))}
                {autoAgents.map((aa) => (
                  <a
                    key={aa.id}
                    href="/dashboard/agents"
                    className="flex items-center gap-3 p-4 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:border-zinc-700 hover:bg-zinc-950 transition-colors"
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${aa.color_class?.replace("text-", "bg-").replace("-400", "-500/10") || "bg-zinc-800"}`}>
                      <Sparkles className={`h-4 w-4 ${aa.color_class || "text-zinc-400"}`} strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-zinc-200 truncate">{aa.name}</span>
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${aa.status === "RUNNING" ? "bg-blue-500 animate-pulse" : aa.status === "ERROR" ? "bg-red-500" : "bg-zinc-500"}`} />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-600">
                        <span>Autonomous</span>
                        <span>·</span>
                        <span>{aa.success_rate}% success</span>
                        {aa.pending_reviews > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-400">{aa.pending_reviews} pending</span>
                          </>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* AI Agent Outputs */}
      {pendingOutputs.length > 0 && (
        <motion.div variants={item}>
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Sparkles className="h-4 w-4 text-purple-400" strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">Agent Insights</h2>
                  <p className="text-xs text-zinc-600 mt-0.5">{pendingOutputs.length} pending review{pendingOutputs.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <a href="/dashboard/agents" className="text-xs font-medium text-purple-400 hover:text-purple-300 transition flex items-center gap-1">
                All agents <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
            <div className="p-5 space-y-3">
              {pendingOutputs.map((o) => (
                <div key={o.id} className="flex items-start justify-between gap-4 p-4 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:border-zinc-700 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {o.wm_agent_definitions && (
                        <span className="text-[11px] text-zinc-600 bg-zinc-800 rounded-full px-2 py-0.5">{o.wm_agent_definitions.name}</span>
                      )}
                      <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${OUTPUT_TYPE_STYLES[o.type] || OUTPUT_TYPE_STYLES.insight}`}>{o.type}</span>
                      {o.linked_client && (
                        <span className="text-[11px] text-zinc-500"><Users className="h-3 w-3 inline mr-0.5" />{o.linked_client}</span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-200 mb-0.5">{o.title}</h3>
                    <p className="text-xs text-zinc-500 leading-relaxed">{o.summary}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => onReviewOutput?.(o.id, "APPROVED")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/30 transition">
                      <ThumbsUp className="h-3 w-3" /> Approve
                    </button>
                    <button onClick={() => onReviewOutput?.(o.id, "DISMISSED")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800 border border-zinc-700 transition">
                      <X className="h-3 w-3" /> Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* AI Suggested Tasks */}
      {pendingTasks.length > 0 && (
        <motion.div variants={item}>
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl">
            <div className="flex items-center gap-3 p-6 pb-4 border-b border-zinc-800">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <CheckCircle className="h-4 w-4 text-amber-400" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Suggested Tasks</h2>
                <p className="text-xs text-zinc-600 mt-0.5">AI-generated follow-ups from your CRM data</p>
              </div>
            </div>
            <div className="p-5 space-y-2">
              {pendingTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-4 p-4 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:border-zinc-700 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">{t.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {t.wm_agent_definitions && <span className="text-[11px] text-zinc-600">{t.wm_agent_definitions.name}</span>}
                      {t.linked_client && <span className="text-[11px] text-zinc-500"><Users className="h-3 w-3 inline mr-0.5" />{t.linked_client}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => onUpdateTask?.(t.id, "COMPLETED")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/30 transition">
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </button>
                    <button onClick={() => onUpdateTask?.(t.id, "DISMISSED")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800 border border-zinc-700 transition">
                      <X className="h-3 w-3" /> Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick Stats Bar */}
      <motion.div variants={item}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-4 text-center">
            <Activity
              className="h-5 w-5 text-emerald-400 mx-auto mb-2"
              strokeWidth={1.5}
            />
            <div className="text-lg font-bold text-zinc-100">
              {metrics.automationEvents}
            </div>
            <div className="text-xs text-zinc-600">Automations (7d)</div>
          </div>
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-4 text-center">
            <Calendar
              className="h-5 w-5 text-blue-400 mx-auto mb-2"
              strokeWidth={1.5}
            />
            <div className="text-lg font-bold text-zinc-100">
              {metrics.prospects}
            </div>
            <div className="text-xs text-zinc-600">Upcoming Appointments</div>
          </div>
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-4 text-center">
            <MessageSquare
              className="h-5 w-5 text-amber-400 mx-auto mb-2"
              strokeWidth={1.5}
            />
            <div className="text-lg font-bold text-zinc-100">
              {metrics.totalConversations}
            </div>
            <div className="text-xs text-zinc-600">Total Conversations</div>
          </div>
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-4 text-center">
            <Target
              className="h-5 w-5 text-rose-400 mx-auto mb-2"
              strokeWidth={1.5}
            />
            <div className="text-lg font-bold text-zinc-100">
              {metrics.churnRisk}
            </div>
            <div className="text-xs text-zinc-600">Pending Tasks</div>
          </div>
        </div>
      </motion.div>

      {/* System Status */}
      <motion.div variants={item}>
        <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Shield className="h-4 w-4 text-emerald-400" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">System Status</h2>
              <p className="text-xs text-zinc-600 mt-0.5">Security & automation health</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="text-xs font-medium text-zinc-300">Security Headers</div>
                <div className="text-[11px] text-zinc-600">CSP + X-Frame active</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="text-xs font-medium text-zinc-300">Rate Limiting</div>
                <div className="text-[11px] text-zinc-600">Auth endpoints protected</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="text-xs font-medium text-zinc-300">Agent Schedule</div>
                <div className="text-[11px] text-zinc-600">Daily 6:00 AM UTC</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-950/60">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="text-xs font-medium text-zinc-300">{autoAgents.length} AI Agents</div>
                <div className="text-[11px] text-zinc-600">{autoAgents.filter((a) => a.last_run).length} have run</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
