// app/agent/AgentRosterClient.tsx
//
// Workspace agent management (chat/email). Voice modality was removed
// from the product 2026-07-01; existing voice agents still render (so
// nothing silently disappears for workspaces that had them) but new
// agents are chat-only. Per-agent config (persona/rules, knowledge
// base, model) lives at /agent/[id] via the "Configure" button.
//
// The legacy autonomous CRM agents (Revenue Analyzer, Churn Risk
// Detector, etc.) were removed — that surface duplicated Autopilot and
// was CRM-era. Autonomous document analysis now lives in Autopilot.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  Bot, ArrowLeft, RefreshCw, Zap, MessageSquare,
  XCircle, Circle, Layers, Radio,
  Settings, Loader2, Sparkles, X, Plus,
} from "lucide-react";

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

// ── Constants ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  deployed: { label: "Deployed", color: "text-[var(--verified)]", bg: "bg-[var(--verified-soft)]", border: "border-[var(--rule)]", dot: "bg-[var(--verified)]" },
  draft: { label: "Draft", color: "text-[var(--ink-muted)]", bg: "bg-[var(--canvas-subtle)]", border: "border-[var(--rule)]", dot: "bg-[var(--ink-subtle)]" },
  archived: { label: "Archived", color: "text-[var(--flag)]", bg: "bg-[var(--flag-soft)]", border: "border-[var(--rule)]", dot: "bg-[var(--flag)]" },
};

const MODALITY_LABELS: Record<string, string> = {
  chat: "Chat", voice: "Voice", "multi-modal": "Multi-modal",
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

export default function AgentsPage() {
  const router = useRouter();

  const [crmAgents, setCrmAgents] = useState<CRMAgent[]>([]);
  const [crmStats, setCrmStats] = useState<CRMStats | null>(null);
  const [crmLoading, setCrmLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent creation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const createAgent = async () => {
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          modality: "chat",
          description: createDescription.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to create agent");
      router.push(`/agent/${json.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create agent");
      setCreating(false);
    }
  };

  // Workspace feature entitlements — used to hide the Dante CTA when the
  // workspace isn't paying for Dante.
  const [features, setFeatures] = useState<string[]>([]);
  const hasDante = features.includes("dante");

  const fetchCRM = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/agent-stats", { credentials: "include" });
      if (!res.ok) { if (res.status === 401) router.push("/auth"); return; }
      const json = await res.json();
      setCrmAgents(json.agents || []);
      setCrmStats(json.stats || null);
    } catch { setError("Failed to load agents"); }
    finally { setCrmLoading(false); }
  }, [router]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await fetchCRM();
    setRefreshing(false);
  }, [fetchCRM]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth"); return; }
      const featuresPromise = fetch("/api/me/features", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { features: [] }))
        .then((j) => setFeatures(Array.isArray(j.features) ? j.features : []))
        .catch(() => setFeatures([]));
      await Promise.all([fetchCRM(), featuresPromise]);
    })();
  }, [fetchCRM, router]);

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

  if (crmLoading) {
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
          <Link href="/home" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition">Home</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="label-section text-xs">Workspace</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Agents</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <Link href="/agent/new" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 transition text-sm font-medium">
            <Sparkles className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Build by chatting</span>
          </Link>
          <Link href="/home" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>
      </div>

      <div className="px-6 md:px-8 py-8 max-w-[1400px] mx-auto">
        {error && (
          <div className="border border-[var(--rule)] bg-[var(--danger-soft)] rounded-[6px] p-4 mb-6 text-sm text-[var(--danger)]">
            {error}
            <button onClick={refreshAll} className="ml-3 text-[var(--danger)] underline">Retry</button>
          </div>
        )}

        {/* Page header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="label-section mb-2">Workspace</div>
            <h1 className="heading-display text-4xl text-[var(--ink)] mb-2">Agents</h1>
            <p className="text-sm text-[var(--ink-muted)] max-w-2xl">
              Chat and email agents that work your clients and workflows. Configure
              each one&apos;s persona, model, and knowledge base.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasDante && (
              <Link href="/dante"
                className="flex items-center gap-2 px-4 py-2.5 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)] text-[var(--ink)] text-sm font-semibold transition">
                <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                Build in Dante
              </Link>
            )}
          </div>
        </div>

        {/* Voice/chat stats */}
        {crmStats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total agents", value: crmStats.totalAgents, icon: Bot },
              { label: "Deployed", value: crmStats.deployed, icon: Radio },
              { label: "Conversations", value: crmStats.totalConversations, icon: MessageSquare },
              { label: "Active", value: crmStats.activeConversations, icon: Circle },
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

        {/* Voice agent roster */}
        <UnifiedRoster
          crmAgents={crmAgents}
          onToggleCRM={handleToggleCRM}
          onCreateVoice={() => {
            setCreateError(null);
            setShowCreateModal(true);
          }}
        />

        {/* Voice/chat performance overview */}
        {crmAgents.length > 0 && (
          <div className="mt-10 card-flat p-6">
            <div className="flex items-center gap-2 mb-5">
              <Layers className="h-4 w-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
              <h2 className="text-base font-semibold text-[var(--ink)]">Agent performance</h2>
            </div>
            <div className="space-y-3">
              {crmAgents.map((agent) => (
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
      </div>

      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/30 backdrop-blur-sm p-4"
          onClick={() => !creating && setShowCreateModal(false)}
        >
          <div
            className="card-flat w-full max-w-md p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => !creating && setShowCreateModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition disabled:opacity-50"
              disabled={creating}
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <div className="label-section mb-2">New agent</div>
            <h2 className="heading-display text-2xl text-[var(--ink)] mb-1">Create an agent</h2>
            <p className="text-xs text-[var(--ink-muted)] mb-5">
              Name it now, configure persona and model on the next screen.
            </p>

            <label className="block mb-4">
              <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">Agent name</div>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                autoFocus
                placeholder="e.g. Riley"
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && createName.trim() && !creating) createAgent();
                }}
              />
            </label>

            <label className="block mb-5">
              <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">Short description (optional)</div>
              <input
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Agent for Acme Realty"
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
              />
            </label>

            {createError && (
              <div className="mb-4 text-xs text-[var(--danger)]">{createError}</div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="px-4 py-2 rounded-[4px] text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={createAgent}
                disabled={!createName.trim() || creating}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Plus className="h-4 w-4" strokeWidth={1.5} />}
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Roster ─────────────────────────────────────────────────────
// Voice/chat agents, with a create tile as the first card.

function UnifiedRoster({
  crmAgents, onToggleCRM, onCreateVoice,
}: {
  crmAgents: CRMAgent[];
  onToggleCRM: (a: CRMAgent) => void;
  onCreateVoice: () => void;
}) {
  return (
    <>
      <div className="label-section mb-4">Agent roster</div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Create voice agent — first tile, always present */}
        <button
          type="button"
          onClick={onCreateVoice}
          className="card-flat card-flat-hover p-5 flex flex-col items-center justify-center text-center min-h-[260px] border-dashed transition group"
        >
          <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2.5 mb-3 group-hover:border-[var(--ink)] transition">
            <Plus className="h-4 w-4 text-[var(--ink)]" strokeWidth={1.5} />
          </div>
          <div className="text-sm font-semibold text-[var(--ink)] mb-1">New agent</div>
          <p className="text-xs text-[var(--ink-muted)] max-w-[220px]">
            Create an agent for chat and email work. Configure persona, model, and knowledge after.
          </p>
        </button>

        {/* Voice / chat agents */}
        {crmAgents.map((agent) => {
          const sc = STATUS_CONFIG[agent.status] || STATUS_CONFIG.draft;
          return (
            <div key={`crm-${agent.id}`} className="card-flat card-flat-hover overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2 shrink-0">
                      <Bot className="h-4 w-4 text-[var(--ink)]" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--ink)] truncate">{agent.name}</h3>
                      <span className="text-[11px] text-[var(--ink-subtle)]">
                        {MODALITY_LABELS[agent.modality] || agent.modality} agent
                      </span>
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
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center"><div className="text-lg font-semibold text-[var(--ink)]">{agent.conversations.completed}</div><div className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wide">Done</div></div>
                  <div className="text-center"><div className="text-lg font-semibold text-[var(--ink)]">{agent.conversations.active}</div><div className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wide">Active</div></div>
                  <div className="text-center"><div className="text-lg font-semibold text-[var(--ink)]">{agent.scenarios}</div><div className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wide">Scenarios</div></div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--ink-subtle)] mt-3">
                  <span>Updated {getTimeAgo(agent.updatedAt || agent.createdAt)}</span>
                  {agent.conversations.failed > 0 && <span className="flex items-center gap-1 text-[var(--danger)]"><XCircle className="h-3 w-3" strokeWidth={1.5} /> {agent.conversations.failed} failed</span>}
                </div>
              </div>
              <div className="flex border-t border-[var(--rule)]">
                <button onClick={() => onToggleCRM(agent)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition ${agent.status === "deployed" ? "text-[var(--flag)] hover:bg-[var(--flag-soft)]" : "text-[var(--verified)] hover:bg-[var(--verified-soft)]"}`}>
                  {agent.status === "deployed" ? <><Circle className="h-3 w-3" strokeWidth={1.5} /> Pause</> : <><Zap className="h-3 w-3" strokeWidth={1.5} /> Deploy</>}
                </button>
                <div className="w-px bg-[var(--rule)]" />
                <Link href={`/agent/${agent.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition">
                  <Settings className="h-3 w-3" strokeWidth={1.5} /> Configure
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
