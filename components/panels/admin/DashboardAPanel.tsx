"use client";

import { useState, useEffect } from "react";
import { Building2, Users, Phone, MessageSquare } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface Stats {
  workspaces: number;
  activeWorkspaces: number;
  users: number;
  deployedAgents: number;
  totalAgents: number;
  recentConversations: number;
}

export default function DashboardAPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard-stats", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(reportError("DashboardAPanel: load stats"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-white/40 text-sm">Loading dashboard...</div>;
  if (!stats) return <div className="flex items-center justify-center h-64 text-white/40 text-sm">Unable to load stats</div>;

  const cards = [
    { label: "Workspaces", value: stats.workspaces, sub: `${stats.activeWorkspaces} active`, icon: Building2 },
    { label: "Users", value: stats.users, sub: "total accounts", icon: Users },
    { label: "Deployed Agents", value: stats.deployedAgents, sub: `of ${stats.totalAgents} total`, icon: Phone },
    { label: "Activity (7d)", value: stats.recentConversations, sub: "conversations", icon: MessageSquare },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="grid grid-cols-2 gap-4">
        {cards.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-2xl border border-purple-500/20 bg-black/40 p-5">
              <div className="flex items-center gap-2 text-white/40 text-xs font-medium uppercase tracking-wider mb-3">
                <Icon className="h-3.5 w-3.5 text-purple-500/60" />{stat.label}
              </div>
              <div className="text-3xl font-bold text-purple-400">{stat.value}</div>
              <div className="text-[11px] text-white/30 mt-1">{stat.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
