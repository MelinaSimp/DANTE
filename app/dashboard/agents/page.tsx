"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  Bot, ArrowLeft, RefreshCw, Zap, MessageSquare,
  CheckCircle2, XCircle, Circle, Layers, Radio,
  Settings, Loader2, Users, DollarSign, AlertTriangle,
  CheckCircle, Play, Sparkles, ThumbsUp, X, Clock,
  Lightbulb, FileText, Bell, Plus, Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import CreateAutonomousAgentModal, {
  type CreatedAgent,
} from "@/components/agents/CreateAutonomousAgentModal";

// ── Types ─────────────────────────────────────────────────────

interface CRMAgent {
  id: string;
  name: string;
  status: string;
  modality: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  scenarios: number;
  conversations: { total: number; active: number; completed: number; failed: number };
  successRate: number;
}

interface CRMStats {
  totalAgents: number;
  deployed: number;
  draft: number;
  archived: number;
  totalConversations: number;
  activeConversations: number;
  completedConversations: number;
  failedConversations: number;
}

interface AutoAgent {
  id: string;
  name: string;
  purpose: string;
  status: string;
  icon: string;
  color_class: string;
  success_rate: number;
  confidence_level: number;
  outputs_today: number;
  pending_reviews: number;
  last_run: string | null;
  last_error: string | null;
  is_custom?: boolean;
}

interface AgentOutput {
  id: string;
  agent_id: string;
  title: string;
  type: string;
  summary: string;
  review_status: string;
  linked_client: string | null;
  created_at: string;
  wm_agent_definitions?: { name: string; icon: string; color_class: string };
}

interface AgentTask {
  id: string;
  agent_id: string;
  description: string;
  status: string;
  linked_client: string | null;
  created_at: string;
  wm_agent_definitions?: { name: string; icon: string; color_class: string };
}

// ── Icon map ──────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Users, DollarSign, MessageSquare, CheckCircle, AlertTriangle,
  Zap, Bot, Sparkles, Lightbulb, FileText, Bell,
};

function AgentIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] || Zap;
  return <Icon className={className} strokeWidth={1.5} />;
}

// ── CRM Agents tab constants ──────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  deployed: { label: "Deployed", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-500" },
  draft: { label: "Draft", color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/30", dot: "bg-zinc-500" },
  archived: { label: "Archived", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-500" },
};

const MODALITY_LABELS: Record<string, string> = {
  chat: "Chat", voice: "Voice", "multi-modal": "Multi-modal",
};

const AUTO_STATUS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  IDLE: { label: "Idle", color: "text-zinc-400", bg: "bg-zinc-500/10", dot: "bg-zinc-500" },
  RUNNING: { label: "Running", color: "text-blue-400", bg: "bg-blue-500/10", dot: "bg-blue-500" },
  ERROR: { label: "Error", color: "text-red-400", bg: "bg-red-500/10", dot: "bg-red-500" },
};

const TYPE_STYLES: Record<string, string> = {
  insight: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  recommendation: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  alert: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  report: "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

// ── Helpers ───────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
      <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function getTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

// ── Main page ─────────────────────────────────────────────────

type Tab = "crm" | "autonomous";

export default function AgentsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("crm");

  // CRM agents state
  const [crmAgents, setCrmAgents] = useState<CRMAgent[]>([]);
  const [crmStats, setCrmStats] = useState<CRMStats | null>(null);
  const [crmLoading, setCrmLoading] = useState(true);

  // Autonomous agents state
  const [autoAgents, setAutoAgents] = useState<AutoAgent[]>([]);
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [autoLoading, setAutoLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [outputFilter, setOutputFilter] = useState<string>("ALL");

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create-agent modal for customer-defined autonomous agents
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);

  // ── CRM data fetch ────────────────────────────────────────

  const fetchCRM = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/agent-stats", { credentials: "include" });
      if (!res.ok) { if (res.status === 401) router.push("/auth"); return; }
      const json = await res.json();
      setCrmAgents(json.agents || []);
      setCrmStats(json.stats || null);
    } catch { setError("Failed to load CRM agents"); }
    finally { setCrmLoading(false); }
  }, [router]);

  // ── Autonomous data fetch ─────────────────────────────────

  const fetchAuto = useCallback(async () => {
    try {
      const seedRes = await fetch("/api/autonomous-agents/seed", { method: "POST", credentials: "include" });
      const seedJson = await seedRes.json().catch(() => ({ agents: [] }));
      const seededAgents = Array.isArray(seedJson.agents) ? seedJson.agents : [];
      setAutoAgents(seededAgents);

      if (seededAgents.length > 0) {
        const [outRes, taskRes] = await Promise.all([
          fetch("/api/autonomous-agents/outputs", { credentials: "include" }),
          fetch("/api/autonomous-agents/tasks", { credentials: "include" }),
        ]);

        if (outRes.ok) {
          const outJson = await outRes.json();
          setOutputs(Array.isArray(outJson) ? outJson : []);
        }
        if (taskRes.ok) {
          const taskJson = await taskRes.json();
          setTasks(Array.isArray(taskJson) ? taskJson : []);
        }
      }
    } catch (e) {
      console.error("fetchAuto error:", e);
      setError("Failed to load autonomous agents");
    }
    finally { setAutoLoading(false); }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchCRM(), fetchAuto()]);
    setRefreshing(false);
  }, [fetchCRM, fetchAuto]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth"); return; }
      await Promise.all([fetchCRM(), fetchAuto()]);
    })();
  }, [fetchCRM, fetchAuto, router]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.setProperty("background", "#000000", "important");
    body.style.setProperty("background", "#000000", "important");
    body.style.setProperty("color", "#fafafa", "important");
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
    };
  }, []);

  // ── Actions ───────────────────────────────────────────────

  const handleToggleCRM = async (agent: CRMAgent) => {
    const newStatus = agent.status === "deployed" ? "draft" : "deployed";
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setCrmAgents((p) => p.map((a) => a.id === agent.id ? { ...a, status: newStatus } : a));
      }
    } catch {}
  };

  const runAgent = async (agentId: string) => {
    setRunningAgent(agentId);
    try {
      await fetch("/api/autonomous-agents/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ agentId }),
      });
      await fetchAuto();
    } catch {}
    finally { setRunningAgent(null); }
  };

  const runAll = async () => {
    setRunningAll(true);
    try {
      await fetch("/api/autonomous-agents/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({}),
      });
      await fetchAuto();
    } catch {}
    finally { setRunningAll(false); }
  };

  const reviewOutput = async (outputId: string, review_status: string) => {
    try {
      await fetch(`/api/autonomous-agents/outputs/${outputId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ review_status }),
      });
      setOutputs((p) => p.map((o) => o.id === outputId ? { ...o, review_status } : o));
    } catch {}
  };

  const handleAgentCreated = (agent: CreatedAgent) => {
    // Prepend so the new custom agent shows up first
    setAutoAgents((prev) => [{ ...agent, is_custom: true }, ...prev]);
  };

  const handleDeleteAgent = async (agent: AutoAgent) => {
    if (!agent.is_custom) return;
    if (!confirm(`Delete custom agent "${agent.name}"? This can't be undone.`))
      return;
    setDeletingAgentId(agent.id);
    try {
      const res = await fetch(`/api/autonomous-agents/${agent.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setAutoAgents((prev) => prev.filter((a) => a.id !== agent.id));
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Failed to delete agent");
      }
    } finally {
      setDeletingAgentId(null);
    }
  };

  const updateTask = async (taskId: string, status: string) => {
    try {
      await fetch(`/api/autonomous-agents/tasks/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ status }),
      });
      setTasks((p) => p.map((t) => t.id === taskId ? { ...t, status } : t));
    } catch {}
  };

  // ── Filtered outputs ──────────────────────────────────────

  const filteredOutputs = outputFilter === "ALL"
    ? outputs
    : outputs.filter((o) => o.review_status === outputFilter);

  // ── Loading state ─────────────────────────────────────────

  const isLoading = tab === "crm" ? crmLoading : autoLoading;

  if (isLoading && crmLoading && autoLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-black/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-zinc-100">Drift</span>
          <span className="text-xs text-zinc-600">/</span>
          <Link href="/dashboard" className="text-xs text-zinc-400 hover:text-zinc-200 transition">Dashboard</Link>
          <span className="text-xs text-zinc-600">/</span>
          <span className="text-xs text-zinc-300">Agents</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition text-sm font-medium disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <Link href="/dashboard" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-6 md:px-8 pt-6">
        <div className="flex gap-1 bg-zinc-900/50 rounded-xl p-1 max-w-xs">
          <button
            onClick={() => setTab("crm")}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "crm" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            CRM Agents
          </button>
          <button
            onClick={() => setTab("autonomous")}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition relative ${tab === "autonomous" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            Autonomous
            {outputs.filter((o) => o.review_status === "PENDING").length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
                {outputs.filter((o) => o.review_status === "PENDING").length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="px-6 md:px-8 py-6 max-w-[1400px] mx-auto">
        {error && (
          <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-4 mb-6 text-sm text-red-400">
            {error}
            <button onClick={refreshAll} className="ml-3 text-red-300 underline">Retry</button>
          </div>
        )}

        {tab === "crm" ? (
          <CRMAgentsTab agents={crmAgents} stats={crmStats} onToggle={handleToggleCRM} />
        ) : (
          <AutonomousAgentsTab
            agents={autoAgents}
            outputs={filteredOutputs}
            tasks={tasks}
            outputFilter={outputFilter}
            setOutputFilter={setOutputFilter}
            runningAll={runningAll}
            runningAgent={runningAgent}
            deletingAgentId={deletingAgentId}
            onRunAll={runAll}
            onRunAgent={runAgent}
            onReviewOutput={reviewOutput}
            onUpdateTask={updateTask}
            onCreateAgent={() => setCreateAgentOpen(true)}
            onDeleteAgent={handleDeleteAgent}
            totalPending={outputs.filter((o) => o.review_status === "PENDING").length}
          />
        )}
      </div>

      <CreateAutonomousAgentModal
        open={createAgentOpen}
        onClose={() => setCreateAgentOpen(false)}
        onCreated={handleAgentCreated}
      />
    </div>
  );
}

// ── CRM Agents Tab ────────────────────────────────────────────

function CRMAgentsTab({ agents, stats, onToggle }: { agents: CRMAgent[]; stats: CRMStats | null; onToggle: (a: CRMAgent) => void }) {
  return (
    <>
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-500/10 rounded-xl">
              <Bot className="h-5 w-5 text-emerald-400" strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-bold text-zinc-50">CRM Agents</h1>
          </div>
          <p className="text-sm text-zinc-500">Your conversational AI agents — chat, voice, and multi-modal.</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total", value: stats.totalAgents, icon: Bot, accent: "bg-emerald-500/10 text-emerald-400" },
            { label: "Deployed", value: stats.deployed, icon: Radio, accent: "bg-emerald-500/10 text-emerald-400" },
            { label: "Conversations", value: stats.totalConversations, icon: MessageSquare, accent: "bg-blue-500/10 text-blue-400" },
            { label: "Completed", value: stats.completedConversations, icon: CheckCircle2, accent: "bg-emerald-500/10 text-emerald-400" },
          ].map((s) => (
            <div key={s.label} className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-tight text-zinc-600">{s.label}</span>
                <div className={`p-1.5 rounded-lg ${s.accent}`}><s.icon className="h-3.5 w-3.5" strokeWidth={1.5} /></div>
              </div>
              <div className="text-2xl font-bold text-zinc-50">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {agents.length === 0 ? (
        <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-12 text-center">
          <Bot className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 mb-1">No CRM agents found</p>
          <p className="text-xs text-zinc-600">Create an agent in the Backend to get started.</p>
        </div>
      ) : (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4">Agent Roster</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {agents.map((agent) => {
                const sc = STATUS_CONFIG[agent.status] || STATUS_CONFIG.draft;
                return (
                  <motion.div key={agent.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="border border-zinc-800 bg-zinc-950/80 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors">
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 bg-zinc-800 rounded-lg shrink-0"><Bot className="h-4 w-4 text-zinc-400" strokeWidth={1.5} /></div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-zinc-100 truncate">{agent.name}</h3>
                            <span className="text-[11px] text-zinc-600">{MODALITY_LABELS[agent.modality] || agent.modality}</span>
                          </div>
                        </div>
                        <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${sc.bg} ${sc.color} border ${sc.border}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />{sc.label}
                        </span>
                      </div>
                      {agent.description && <p className="text-xs text-zinc-600 mb-4 line-clamp-2">{agent.description}</p>}
                      <div className="flex items-center justify-between text-xs mb-3">
                        <span className="text-zinc-500">Success rate</span>
                        <span className="font-semibold text-zinc-300">{agent.successRate}%</span>
                      </div>
                      <ProgressBar value={agent.successRate} />
                      <div className="grid grid-cols-3 gap-3 mt-4 mb-4">
                        <div className="text-center"><div className="text-lg font-bold text-zinc-200">{agent.conversations.completed}</div><div className="text-[10px] text-zinc-600 uppercase tracking-wide">Done</div></div>
                        <div className="text-center"><div className="text-lg font-bold text-zinc-200">{agent.conversations.active}</div><div className="text-[10px] text-zinc-600 uppercase tracking-wide">Active</div></div>
                        <div className="text-center"><div className="text-lg font-bold text-zinc-200">{agent.scenarios}</div><div className="text-[10px] text-zinc-600 uppercase tracking-wide">Scenarios</div></div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-600">
                        <span>Updated {getTimeAgo(agent.updatedAt || agent.createdAt)}</span>
                        {agent.conversations.failed > 0 && <span className="flex items-center gap-1 text-red-400"><XCircle className="h-3 w-3" /> {agent.conversations.failed} failed</span>}
                      </div>
                    </div>
                    <div className="flex border-t border-zinc-800">
                      <button onClick={() => onToggle(agent)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition ${agent.status === "deployed" ? "text-amber-400 hover:bg-amber-500/10" : "text-emerald-400 hover:bg-emerald-500/10"}`}>
                        {agent.status === "deployed" ? <><Circle className="h-3 w-3" /> Pause</> : <><Zap className="h-3 w-3" /> Deploy</>}
                      </button>
                      <div className="w-px bg-zinc-800" />
                      <Link href={`/app?agentId=${agent.id}`}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition">
                        <Settings className="h-3 w-3" /> Configure
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {agents.length > 0 && (
            <div className="mt-8 border border-zinc-800 bg-zinc-950/80 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5"><Layers className="h-4 w-4 text-zinc-500" strokeWidth={1.5} /><h2 className="text-base font-semibold text-zinc-100">Performance Overview</h2></div>
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-4">
                    <span className="text-xs text-zinc-400 w-36 truncate shrink-0">{agent.name}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden flex">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${agent.successRate}%` }} />
                        {agent.conversations.failed > 0 && <div className="h-full bg-red-500 transition-all" style={{ width: `${agent.conversations.total > 0 ? (agent.conversations.failed / agent.conversations.total) * 100 : 0}%` }} />}
                      </div>
                      <span className="text-xs text-zinc-500 w-10 text-right">{agent.successRate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Autonomous Agents Tab ─────────────────────────────────────

function AutonomousAgentsTab({
  agents, outputs, tasks, outputFilter, setOutputFilter,
  runningAll, runningAgent, deletingAgentId,
  onRunAll, onRunAgent, onReviewOutput, onUpdateTask, onCreateAgent, onDeleteAgent, totalPending,
}: {
  agents: AutoAgent[];
  outputs: AgentOutput[];
  tasks: AgentTask[];
  outputFilter: string;
  setOutputFilter: (f: string) => void;
  runningAll: boolean;
  runningAgent: string | null;
  deletingAgentId: string | null;
  onRunAll: () => void;
  onRunAgent: (id: string) => void;
  onReviewOutput: (id: string, status: string) => void;
  onUpdateTask: (id: string, status: string) => void;
  onCreateAgent: () => void;
  onDeleteAgent: (agent: AutoAgent) => void;
  totalPending: number;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/10 rounded-xl">
              <Sparkles className="h-5 w-5 text-purple-400" strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-bold text-zinc-50">Autonomous Agents</h1>
          </div>
          <p className="text-sm text-zinc-500">AI agents that analyze your CRM data and generate actionable insights.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCreateAgent}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-fuchsia-500/50 hover:bg-fuchsia-500/10 text-zinc-100 hover:text-fuchsia-300 text-sm font-semibold transition">
            <Plus className="h-4 w-4" />
            Create agent
          </button>
          <button onClick={onRunAll} disabled={runningAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50">
            {runningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {runningAll ? "Running..." : "Run All Agents"}
          </button>
        </div>
      </div>

      {/* Agent cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-10">
        <AnimatePresence>
          {agents.map((agent) => {
            const st = AUTO_STATUS[agent.status] || AUTO_STATUS.IDLE;
            const isRunning = runningAgent === agent.id || runningAll;
            return (
              <motion.div key={agent.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`p-2 rounded-lg ${agent.color_class?.replace("text-", "bg-").replace("-400", "-500/10") || "bg-zinc-800"}`}>
                    <AgentIcon name={agent.icon} className={`h-4 w-4 ${agent.color_class || "text-zinc-400"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-zinc-100 truncate">{agent.name}</h3>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-blue-500 animate-pulse" : st.dot}`} />
                      <span className="text-[11px] text-zinc-600">{isRunning ? "Running..." : st.label}</span>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-600 mb-3 line-clamp-2">{agent.purpose}</p>

                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-zinc-500">Success</span>
                  <span className="font-semibold text-zinc-300">{agent.success_rate}%</span>
                </div>
                <ProgressBar value={agent.success_rate} />

                <div className="flex items-center justify-between mt-3 text-[11px] text-zinc-600">
                  <span>{agent.outputs_today} outputs</span>
                  {agent.pending_reviews > 0 && (
                    <span className="text-amber-400">{agent.pending_reviews} pending</span>
                  )}
                </div>

                <div className="text-[11px] text-zinc-700 mt-1">
                  Last run: {getTimeAgo(agent.last_run)}
                </div>

                {agent.status === "ERROR" && agent.last_error && (
                  <p className="text-[11px] text-red-400 mt-2 line-clamp-2">{agent.last_error}</p>
                )}

                <div className="flex items-center gap-1.5 mt-3">
                  <button onClick={() => onRunAgent(agent.id)} disabled={isRunning}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 border border-zinc-800 hover:border-emerald-500/30 transition disabled:opacity-50">
                    {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    {isRunning ? "Running..." : "Run"}
                  </button>
                  {agent.is_custom && (
                    <button onClick={() => onDeleteAgent(agent)} disabled={deletingAgentId === agent.id}
                      title="Delete agent"
                      className="flex items-center justify-center px-2 py-2 rounded-lg text-xs font-medium text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 border border-zinc-800 hover:border-rose-500/30 transition disabled:opacity-50">
                      {deletingAgentId === agent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Outputs section */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
            <h2 className="text-base font-semibold text-zinc-100">Agent Outputs</h2>
            {totalPending > 0 && (
              <span className="text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                {totalPending} pending
              </span>
            )}
          </div>
          <select value={outputFilter} onChange={(e) => setOutputFilter(e.target.value)}
            className="text-xs bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-400 focus:outline-none focus:border-zinc-600">
            <option value="ALL">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>

        {outputs.length === 0 ? (
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-8 text-center">
            <Lightbulb className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No outputs yet. Run an agent to generate insights.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {outputs.map((o) => (
                <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {o.wm_agent_definitions && (
                          <span className="text-[11px] text-zinc-600 bg-zinc-800 rounded-full px-2 py-0.5">
                            {o.wm_agent_definitions.name}
                          </span>
                        )}
                        <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${TYPE_STYLES[o.type] || TYPE_STYLES.insight}`}>
                          {o.type}
                        </span>
                        {o.linked_client && (
                          <span className="text-[11px] text-zinc-500">
                            <Users className="h-3 w-3 inline mr-0.5" />{o.linked_client}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-zinc-200 mb-1">{o.title}</h3>
                      <p className="text-xs text-zinc-500 leading-relaxed">{o.summary}</p>
                      <div className="text-[11px] text-zinc-700 mt-2">
                        <Clock className="h-3 w-3 inline mr-1" />{getTimeAgo(o.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {o.review_status === "PENDING" ? (
                        <>
                          <button onClick={() => onReviewOutput(o.id, "APPROVED")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/30 transition">
                            <ThumbsUp className="h-3 w-3" /> Approve
                          </button>
                          <button onClick={() => onReviewOutput(o.id, "DISMISSED")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800 border border-zinc-700 transition">
                            <X className="h-3 w-3" /> Dismiss
                          </button>
                        </>
                      ) : (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${o.review_status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>
                          {o.review_status === "APPROVED" ? "Approved" : "Dismissed"}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Tasks section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
          <h2 className="text-base font-semibold text-zinc-100">Suggested Tasks</h2>
        </div>

        {tasks.length === 0 ? (
          <div className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-8 text-center">
            <CheckCircle className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No tasks generated yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.filter((t) => t.status === "PENDING").map((t) => (
              <div key={t.id} className="flex items-center gap-4 border border-zinc-800 bg-zinc-950/80 rounded-xl p-4 hover:border-zinc-700 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200">{t.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {t.wm_agent_definitions && (
                      <span className="text-[11px] text-zinc-600">{t.wm_agent_definitions.name}</span>
                    )}
                    {t.linked_client && (
                      <span className="text-[11px] text-zinc-500"><Users className="h-3 w-3 inline mr-0.5" />{t.linked_client}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => onUpdateTask(t.id, "COMPLETED")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/30 transition">
                    <CheckCircle2 className="h-3 w-3" /> Done
                  </button>
                  <button onClick={() => onUpdateTask(t.id, "DISMISSED")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800 border border-zinc-700 transition">
                    <X className="h-3 w-3" /> Dismiss
                  </button>
                </div>
              </div>
            ))}
            {tasks.filter((t) => t.status !== "PENDING").length > 0 && (
              <div className="pt-3">
                <p className="text-[11px] text-zinc-600 mb-2">{tasks.filter((t) => t.status !== "PENDING").length} completed/dismissed tasks</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
