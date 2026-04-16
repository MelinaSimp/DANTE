"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Bot } from "lucide-react";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

interface MeetingPrep {
  id: string;
  contactName: string;
  scheduledAt: string;
  serviceType: string;
  status: string;
  notes: string | null;
}

interface DashboardData {
  metrics: {
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
  };
  alerts: any[];
  revenueEngine: any[];
  chartData: any[];
  meetingPrep: MeetingPrep[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [agents, setAgents] = useState<any[]>([]);
  const [autoAgents, setAutoAgents] = useState<any[]>([]);
  const [aiOutputs, setAiOutputs] = useState<any[]>([]);
  const [aiTasks, setAiTasks] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth"); return; }

      try {
        const [dashRes, agentRes, seedRes, outputsRes, tasksRes] = await Promise.all([
          fetch("/api/dashboard", { credentials: "include" }),
          fetch("/api/dashboard/agent-stats", { credentials: "include" }),
          fetch("/api/autonomous-agents/seed", { method: "POST", credentials: "include" }),
          fetch("/api/autonomous-agents/outputs", { credentials: "include" }),
          fetch("/api/autonomous-agents/tasks", { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (!dashRes.ok) {
          if (dashRes.status === 401) { router.push("/auth"); return; }
          throw new Error("Failed to load dashboard");
        }
        const json = await dashRes.json();
        if (!cancelled) { setData(json); setError(null); }
        if (agentRes.ok) {
          const agentJson = await agentRes.json();
          if (!cancelled) setAgents(agentJson.agents || []);
        }
        const seedJson = await seedRes.json().catch(() => ({ agents: [] }));
        if (!cancelled) setAutoAgents(Array.isArray(seedJson.agents) ? seedJson.agents : []);
        if (outputsRes.ok) {
          const out = await outputsRes.json();
          if (!cancelled) setAiOutputs(Array.isArray(out) ? out : []);
        }
        if (tasksRes.ok) {
          const tsk = await tasksRes.json();
          if (!cancelled) setAiTasks(Array.isArray(tsk) ? tsk : []);
        }
      } catch {
        if (!cancelled) setError("Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [router]);

  const handleReviewOutput = async (outputId: string, review_status: string) => {
    await fetch(`/api/autonomous-agents/outputs/${outputId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ review_status }),
    }).catch(() => {});
    setAiOutputs((p) => p.map((o) => o.id === outputId ? { ...o, review_status } : o));
  };

  const handleUpdateTask = async (taskId: string, status: string) => {
    await fetch(`/api/autonomous-agents/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ status }),
    }).catch(() => {});
    setAiTasks((p) => p.map((t) => t.id === taskId ? { ...t, status } : t));
  };

  const fetchDashboard = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) { router.push("/auth"); return; }
        throw new Error("Failed to load dashboard");
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector("main");
    html.style.setProperty("background", "#000000", "important");
    body.style.setProperty("background", "#000000", "important");
    body.style.setProperty("color", "#fafafa", "important");
    if (main) (main as HTMLElement).style.setProperty("background", "#000000", "important");
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
      if (main) (main as HTMLElement).style.removeProperty("background");
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">{error || "Something went wrong"}</p>
          <button
            onClick={() => { setLoading(true); fetchDashboard(); }}
            className="text-sm text-blue-400 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-black/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo-circle.png"
            alt="Drift"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-sm font-semibold text-zinc-100">Drift</span>
          <span className="text-xs text-zinc-600">/</span>
          <span className="text-xs text-zinc-400">Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/agents"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition text-sm font-medium"
          >
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">Agents</span>
          </Link>
          <button
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <Link
            href="/select"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Hub</span>
          </Link>
        </div>
      </div>

      {/* Dashboard content */}
      <div className="px-6 md:px-8 py-8">
        <DashboardClient
          metrics={data.metrics}
          alerts={data.alerts}
          revenueEngine={data.revenueEngine}
          chartData={data.chartData}
          agents={agents}
          autoAgents={autoAgents}
          aiOutputs={aiOutputs}
          aiTasks={aiTasks}
          meetingPrep={data.meetingPrep || []}
          onReviewOutput={handleReviewOutput}
          onUpdateTask={handleUpdateTask}
        />
      </div>
    </div>
  );
}
