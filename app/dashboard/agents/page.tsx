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
  deployed: { label: "Deployed", color: "text-[var(--verified)]", bg: "bg-[var(--verified-soft)]", border: "border-[var(--rule)]", dot: "bg-[var(--verified)]" },
  draft: { label: "Draft", color: "text-[var(--ink-muted)]", bg: "bg-[var(--canvas-subtle)]", border: "border-[var(--rule)]", dot: "bg-[var(--ink-subtle)]" },
  archived: { label: "Archived", color: "text-[var(--flag)]", bg: "bg-[var(--flag-soft)]", border: "border-[var(--rule)]", dot: "bg-[var(--flag)]" },
};

const MODALITY_LABELS: Record<string, string> = {
  chat: "Chat", voice: "Voice", "multi-modal": "Multi-modal",
};

const AUTO_STATUS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  IDLE: { label: "Idle", color: "text-[var(--ink-muted)]", bg: "bg-[var(--canvas-subtle)]", dot: "bg-[var(--ink-subtle)]" },
  RUNNING: { label: "Running", color: "text-[var(--accent)]", bg: "bg-[var(--accent-soft)]", dot: "bg-[var(--accent)]" },
  ERROR: { label: "Error", color: "text-[var(--danger)]", bg: "bg-[var(--danger-soft)]", dot: "bg-[var(--danger)]" },
};

const TYPE_STYLES: Record<string, string> = {
  insight: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--rule)]",
  recommendation: "bg-[var(--verified-soft)] text-[var(--verified)] border-[var(--rule)]",
  alert: "bg-[var(--flag-soft)] text-[var(--flag)] border-[var(--rule)]",
  report: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--rule)]",
};

// ── Helpers ───────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 rounded-full bg-[var(--canvas-muted)] overflow-hidden">
      <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
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
    html.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("color", "var(--ink)", "important");
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
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--ink-muted)]" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dashboard" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition">Dashboard</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Agents</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <Link href="/dashboard" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-6 md:px-8 pt-6">
        <div className="flex gap-1 bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[4px] p-0.5 max-w-xs">
          <button
            onClick={() => setTab("crm")}
            className={`flex-1 px-4 py-2 rounded-[4px] text-sm font-medium transition ${tab === "crm" ? "bg-[var(--canvas)] border border-[var(--rule-strong)] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
          >
            CRM Agents
          </button>
          <button
            onClick={() => setTab("autonomous")}
            className={`flex-1 px-4 py-2 rounded-[4px] text-sm font-medium transition relative ${tab === "autonomous" ? "bg-[var(--canvas)] border border-[var(--rule-strong)] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
          >
            Autonomous
            {outputs.filter((o) => o.review_status === "PENDING").length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full bg-[var(--flag)] text-[10px] font-bold text-[var(--canvas)]">
                {outputs.filter((o) => o.review_status === "PENDING").length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="px-6 md:px-8 py-6 max-w-[1400px] mx-auto">
        {error && (
          <div className="border border-[var(--rule)] bg-[var(--danger-soft)] rounded-[6px] p-4 mb-6 text-sm text-[var(--danger)]">
            {error}
            <button onClick={refreshAll} className="ml-3 text-[var(--danger)] underline">Retry</button>
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
            <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2">
              <Bot className="h-5 w-5 text-[var(--ink)]" strokeWidth={1.5} />
            </div>
            <h1 className="heading-display text-4xl text-[var(--ink)]">CRM Agents</h1>
          </div>
          <p className="text-sm text-[var(--ink-muted)]">Your conversational AI agents — chat, voice, and multi-modal.</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total", value: stats.totalAgents, icon: Bot },
            { label: "Deployed", value: stats.deployed, icon: Radio },
            { label: "Conversations", value: stats.totalConversations, icon: MessageSquare },
            { label: "Completed", value: stats.completedConversations, icon: CheckCircle2 },
          ].map((s) => (
            <div key={s.label} className="card-flat p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="label-section">{s.label}</span>
                <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-1.5">
                  <s.icon className="h-3.5 w-3.5 text-[var(--ink)]" strokeWidth={1.5} />
                </div>
              </div>
              <div className="text-2xl font-semibold text-[var(--ink)]">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {agents.length === 0 ? (
        <div className="card-flat p-12 text-center">
          <Bot className="h-10 w-10 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-[var(--ink-muted)] mb-1">No CRM agents found</p>
          <p className="text-xs text-[var(--ink-subtle)]">Create an agent in the Backend to get started.</p>
        </div>
      ) : (
        <>
          <div className="label-section mb-4">Agent Roster</div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => {
              const sc = STATUS_CONFIG[agent.status] || STATUS_CONFIG.draft;
              return (
                <div key={agent.id} className="card-flat card-flat-hover overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2 shrink-0">
                          <Bot className="h-4 w-4 text-[var(--ink)]" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[var(--ink)] truncate">{agent.name}</h3>
                          <span className="text-[11px] text-[var(--ink-subtle)]">{MODALITY_LABELS[agent.modality] || agent.modality}</span>
                        </div>
                      </div>
                      <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${sc.bg} ${sc.color} border ${sc.border}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />{sc.label}
                      </span>
                    </div>
                    {agent.description && <p className="text-xs text-[var(--ink-muted)] mb-4 line-clamp-2">{agent.description}</p>}
                    <div className="flex items-center justify-between text-xs mb-3">
                      <span className="text-[var(--ink-muted)]">Success rate</span>
                      <span className="font-semibold text-[var(--ink)]">{agent.successRate}%</span>
                    </div>
                    <ProgressBar value={agent.successRate} />
                    <div className="grid grid-cols-3 gap-3 mt-4 mb-4">
                      <div className="text-center"><div className="text-lg font-semibold text-[var(--ink)]">{agent.conversations.completed}</div><div className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wide">Done</div></div>
                      <div className="text-center"><div className="text-lg font-semibold text-[var(--ink)]">{agent.conversations.active}</div><div className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wide">Active</div></div>
                      <div className="text-center"><div className="text-lg font-semibold text-[var(--ink)]">{agent.scenarios}</div><div className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wide">Scenarios</div></div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--ink-subtle)]">
                      <span>Updated {getTimeAgo(agent.updatedAt || agent.createdAt)}</span>
                      {agent.conversations.failed > 0 && <span className="flex items-center gap-1 text-[var(--danger)]"><XCircle className="h-3 w-3" strokeWidth={1.5} /> {agent.conversations.failed} failed</span>}
                    </div>
                  </div>
                  <div className="flex border-t border-[var(--rule)]">
                    <button onClick={() => onToggle(agent)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition ${agent.status === "deployed" ? "text-[var(--flag)] hover:bg-[var(--flag-soft)]" : "text-[var(--verified)] hover:bg-[var(--verified-soft)]"}`}>
                      {agent.status === "deployed" ? <><Circle className="h-3 w-3" strokeWidth={1.5} /> Pause</> : <><Zap className="h-3 w-3" strokeWidth={1.5} /> Deploy</>}
                    </button>
                    <div className="w-px bg-[var(--rule)]" />
                    <Link href={`/app?agentId=${agent.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition">
                      <Settings className="h-3 w-3" strokeWidth={1.5} /> Configure
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {agents.length > 0 && (
            <div className="mt-8 card-flat p-6">
              <div className="flex items-center gap-2 mb-5">
                <Layers className="h-4 w-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                <h2 className="text-base font-semibold text-[var(--ink)]">Performance Overview</h2>
              </div>
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-4">
                    <span className="text-xs text-[var(--ink-muted)] w-36 truncate shrink-0">{agent.name}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-[var(--canvas-muted)] overflow-hidden flex">
                        <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${agent.successRate}%` }} />
                        {agent.conversations.failed > 0 && <div className="h-full bg-[var(--danger)] transition-all" style={{ width: `${agent.conversations.total > 0 ? (agent.conversations.failed / agent.conversations.total) * 100 : 0}%` }} />}
                      </div>
                      <span className="text-xs text-[var(--ink-muted)] w-10 text-right">{agent.successRate}%</span>
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
            <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2">
              <Sparkles className="h-5 w-5 text-[var(--ink)]" strokeWidth={1.5} />
            </div>
            <h1 className="heading-display text-4xl text-[var(--ink)]">Autonomous Agents</h1>
          </div>
          <p className="text-sm text-[var(--ink-muted)]">AI agents that analyze your CRM data and generate actionable insights.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCreateAgent}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)] text-[var(--ink)] text-sm font-semibold transition">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Create agent
          </button>
          <button onClick={onRunAll} disabled={runningAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-50">
            {runningAll ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Play className="h-4 w-4" strokeWidth={1.5} />}
            {runningAll ? "Running..." : "Run All Agents"}
          </button>
        </div>
      </div>

      {/* Agent cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-10">
        {agents.map((agent) => {
          const st = AUTO_STATUS[agent.status] || AUTO_STATUS.IDLE;
          const isRunning = runningAgent === agent.id || runningAll;
          return (
            <div key={agent.id} className="card-flat card-flat-hover p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2">
                  <AgentIcon name={agent.icon} className="h-4 w-4 text-[var(--ink)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[var(--ink)] truncate">{agent.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-[var(--accent)] animate-pulse" : st.dot}`} />
                    <span className="text-[11px] text-[var(--ink-subtle)]">{isRunning ? "Running..." : st.label}</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-[var(--ink-muted)] mb-3 line-clamp-2">{agent.purpose}</p>

              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-[var(--ink-muted)]">Success</span>
                <span className="font-semibold text-[var(--ink)]">{agent.success_rate}%</span>
              </div>
              <ProgressBar value={agent.success_rate} />

              <div className="flex items-center justify-between mt-3 text-[11px] text-[var(--ink-subtle)]">
                <span>{agent.outputs_today} outputs</span>
                {agent.pending_reviews > 0 && (
                  <span className="text-[var(--flag)]">{agent.pending_reviews} pending</span>
                )}
              </div>

              <div className="text-[11px] text-[var(--ink-subtle)] mt-1">
                Last run: {getTimeAgo(agent.last_run)}
              </div>

              {agent.status === "ERROR" && agent.last_error && (
                <p className="text-[11px] text-[var(--danger)] mt-2 line-clamp-2">{agent.last_error}</p>
              )}

              <div className="flex items-center gap-1.5 mt-3">
                <button onClick={() => onRunAgent(agent.id)} disabled={isRunning}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-[4px] text-xs font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)] border border-[var(--rule)] hover:border-[var(--rule-strong)] transition disabled:opacity-50">
                  {isRunning ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> : <Play className="h-3 w-3" strokeWidth={1.5} />}
                  {isRunning ? "Running..." : "Run"}
                </button>
                {agent.is_custom && (
                  <button onClick={() => onDeleteAgent(agent)} disabled={deletingAgentId === agent.id}
                    title="Delete agent"
                    className="flex items-center justify-center px-2 py-2 rounded-[4px] text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] border border-[var(--rule)] transition disabled:opacity-50">
                    {deletingAgentId === agent.id ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> : <Trash2 className="h-3 w-3" strokeWidth={1.5} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Outputs section */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
            <h2 className="text-base font-semibold text-[var(--ink)]">Agent Outputs</h2>
            {totalPending > 0 && (
              <span className="text-xs font-medium text-[var(--flag)] bg-[var(--flag-soft)] border border-[var(--rule)] rounded-full px-2 py-0.5">
                {totalPending} pending
              </span>
            )}
          </div>
          <select value={outputFilter} onChange={(e) => setOutputFilter(e.target.value)}
            className="text-xs bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-1.5 text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]">
            <option value="ALL">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>

        {outputs.length === 0 ? (
          <div className="card-flat p-8 text-center">
            <Lightbulb className="h-8 w-8 text-[var(--ink-subtle)] mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-[var(--ink-muted)]">No outputs yet. Run an agent to generate insights.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {outputs.map((o) => (
              <div key={o.id} className="card-flat card-flat-hover p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {o.wm_agent_definitions && (
                        <span className="text-[11px] text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-full px-2 py-0.5">
                          {o.wm_agent_definitions.name}
                        </span>
                      )}
                      <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${TYPE_STYLES[o.type] || TYPE_STYLES.insight}`}>
                        {o.type}
                      </span>
                      {o.linked_client && (
                        <span className="text-[11px] text-[var(--ink-muted)]">
                          <Users className="h-3 w-3 inline mr-0.5" strokeWidth={1.5} />{o.linked_client}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--ink)] mb-1">{o.title}</h3>
                    <p className="text-xs text-[var(--ink-muted)] leading-relaxed">{o.summary}</p>
                    <div className="text-[11px] text-[var(--ink-subtle)] mt-2">
                      <Clock className="h-3 w-3 inline mr-1" strokeWidth={1.5} />{getTimeAgo(o.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {o.review_status === "PENDING" ? (
                      <>
                        <button onClick={() => onReviewOutput(o.id, "APPROVED")}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-[4px] text-xs font-medium text-[var(--verified)] hover:bg-[var(--verified-soft)] border border-[var(--rule)] transition">
                          <ThumbsUp className="h-3 w-3" strokeWidth={1.5} /> Approve
                        </button>
                        <button onClick={() => onReviewOutput(o.id, "DISMISSED")}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-[4px] text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] border border-[var(--rule)] transition">
                          <X className="h-3 w-3" strokeWidth={1.5} /> Dismiss
                        </button>
                      </>
                    ) : (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${o.review_status === "APPROVED" ? "bg-[var(--verified-soft)] text-[var(--verified)]" : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)]"}`}>
                        {o.review_status === "APPROVED" ? "Approved" : "Dismissed"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tasks section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-4 w-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <h2 className="text-base font-semibold text-[var(--ink)]">Suggested Tasks</h2>
        </div>

        {tasks.length === 0 ? (
          <div className="card-flat p-8 text-center">
            <CheckCircle className="h-8 w-8 text-[var(--ink-subtle)] mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-[var(--ink-muted)]">No tasks generated yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.filter((t) => t.status === "PENDING").map((t) => (
              <div key={t.id} className="flex items-center gap-4 card-flat card-flat-hover p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--ink)]">{t.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {t.wm_agent_definitions && (
                      <span className="text-[11px] text-[var(--ink-subtle)]">{t.wm_agent_definitions.name}</span>
                    )}
                    {t.linked_client && (
                      <span className="text-[11px] text-[var(--ink-muted)]"><Users className="h-3 w-3 inline mr-0.5" strokeWidth={1.5} />{t.linked_client}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => onUpdateTask(t.id, "COMPLETED")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-[4px] text-xs font-medium text-[var(--verified)] hover:bg-[var(--verified-soft)] border border-[var(--rule)] transition">
                    <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} /> Done
                  </button>
                  <button onClick={() => onUpdateTask(t.id, "DISMISSED")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-[4px] text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] border border-[var(--rule)] transition">
                    <X className="h-3 w-3" strokeWidth={1.5} /> Dismiss
                  </button>
                </div>
              </div>
            ))}
            {tasks.filter((t) => t.status !== "PENDING").length > 0 && (
              <div className="pt-3">
                <p className="text-[11px] text-[var(--ink-subtle)] mb-2">{tasks.filter((t) => t.status !== "PENDING").length} completed/dismissed tasks</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
