import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { Users, Building2, Phone, MessageSquare, Shield, UserPlus, BarChart3, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth");

  const { data: me } = await supabase
    .from("profiles")
    .select("id, is_superadmin, full_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  const isAdmin = hasSuperadminAccess(auth.user.email, me?.is_superadmin);
  if (!isAdmin) redirect("/home");

  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, created_at, owner_id, enabled_features, plan_status")
    .order("created_at", { ascending: false });

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, workspace_id, full_name");

  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, workspace_id, status, phone_number");

  const { data: conversations } = await supabaseAdmin
    .from("conversations")
    .select("id, workspace_id, created_at")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const totalUsers = profiles?.length || 0;
  const totalAgents = agents?.length || 0;
  const totalDeployed = agents?.filter(a => a.status === "deployed").length || 0;
  const totalPhoneNumbers = new Set(agents?.filter(a => a.phone_number).map(a => a.phone_number)).size;
  const activeWorkspaces = workspaces?.filter(w => w.plan_status === "active").length || 0;
  const recentConversations = conversations?.length || 0;

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-1">Dashboard</h1>
        <p className="text-white/40 text-sm">
          Welcome back, <span className="text-purple-500 font-medium">{me?.full_name || auth.user.email}</span>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Workspaces", value: workspaces?.length || 0, sub: `${activeWorkspaces} active`, icon: Building2 },
          { label: "Users", value: totalUsers, sub: "total accounts", icon: Users },
          { label: "Deployed Agents", value: totalDeployed, sub: `of ${totalAgents} total`, icon: Phone },
          { label: "Activity (7d)", value: recentConversations, sub: "conversations", icon: MessageSquare },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-2xl border border-purple-500/20 bg-black p-5">
              <div className="flex items-center gap-2 text-white/40 text-xs font-medium uppercase tracking-wider mb-3">
                <Icon className="h-3.5 w-3.5 text-purple-500/60" />
                {stat.label}
              </div>
              <div className="text-3xl font-bold text-purple-500">{stat.value}</div>
              <div className="text-[11px] text-white/30 mt-1">{stat.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {[
          { name: "Feature Management", desc: "Configure features per workspace", href: "/admin/features", icon: Shield },
          { name: "Manage Invites", desc: "Create workspace invitations", href: "/admin/invites", icon: UserPlus },
          { name: "Analytics & Reports", desc: "View expenses and platform data", href: "/admin/analytics", icon: BarChart3 },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="group rounded-2xl border border-purple-500/20 bg-black p-6 transition-all duration-200 hover:border-purple-500/50 hover:bg-purple-500/5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-purple-500" />
                </div>
                <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-purple-500 transition-colors" />
              </div>
              <h3 className="text-white font-semibold mb-1">{action.name}</h3>
              <p className="text-white/40 text-sm">{action.desc}</p>
            </Link>
          );
        })}
      </div>

      {/* Recent Workspaces */}
      <div className="rounded-2xl border border-purple-500/20 bg-black overflow-hidden">
        <div className="px-6 py-5 border-b border-purple-500/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Workspaces</h2>
          <Link href="/admin/workspaces" className="text-xs text-purple-500 hover:text-purple-400 transition font-medium">
            View All →
          </Link>
        </div>
        {!workspaces || workspaces.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No workspaces yet</p>
          </div>
        ) : (
          <div className="divide-y divide-purple-500/10">
            {workspaces.slice(0, 5).map((ws) => {
              const owner = profiles?.find(p => p.id === ws.owner_id);
              const wsAgents = agents?.filter(a => a.workspace_id === ws.id) || [];
              const wsUsers = profiles?.filter(p => p.workspace_id === ws.id) || [];
              const featureCount = (ws.enabled_features || []).length;
              const statusColor = ws.plan_status === "active"
                ? "text-green-400 bg-green-400/10 border-green-400/30"
                : ws.plan_status === "trial"
                ? "text-blue-400 bg-blue-400/10 border-blue-400/30"
                : ws.plan_status === "past_due"
                ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
                : "text-red-400 bg-red-400/10 border-red-400/30";

              return (
                <div key={ws.id} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-purple-500/70" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{ws.name}</div>
                      <div className="text-[11px] text-white/30">{owner?.full_name || "Unknown"} · {wsUsers.length} user{wsUsers.length !== 1 ? "s" : ""} · {wsAgents.length} agent{wsAgents.length !== 1 ? "s" : ""} · {featureCount} features</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${statusColor}`}>
                      {ws.plan_status || "active"}
                    </span>
                    <span className="text-[11px] text-white/20">{new Date(ws.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
