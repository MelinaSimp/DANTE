// app/admin/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { Users, Building2, Phone, MessageSquare, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Gate: only superadmins can access
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth");

  const { data: me } = await supabase
    .from("profiles")
    .select("id, is_superadmin, full_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  const isAdmin = hasSuperadminAccess(auth.user.email, me?.is_superadmin);
  if (!isAdmin) {
    // Redirect to /home instead of / to avoid redirect loop with root page
    redirect("/home");
  }

  // Get all workspaces with stats (using admin client to bypass RLS)
  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select(`
      id,
      name,
      created_at,
      owner_id
    `)
    .order("created_at", { ascending: false });

  // Get all profiles with workspace info (email comes from auth.users)
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, workspace_id, full_name");
  
  // Get user emails from auth.users
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const emailMap = new Map<string, string>();
  authUsers?.users.forEach(u => {
    if (u.email) emailMap.set(u.id, u.email);
  });

  // Get all agents per workspace
  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, workspace_id, status, phone_number, modality");

  // Get all conversations per workspace (for activity)
  const { data: conversations } = await supabaseAdmin
    .from("conversations")
    .select("id, workspace_id, created_at")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days

  // Calculate stats per workspace
  const workspaceStats = new Map<string, {
    users: number;
    agents: number;
    deployedAgents: number;
    phoneNumbers: number;
    recentActivity: number;
    health: 'healthy' | 'warning' | 'error';
  }>();

  workspaces?.forEach(ws => {
    const wsProfiles = profiles?.filter(p => p.workspace_id === ws.id) || [];
    const wsAgents = agents?.filter(a => a.workspace_id === ws.id) || [];
    const wsConversations = conversations?.filter(c => c.workspace_id === ws.id) || [];
    
    const deployedAgents = wsAgents.filter(a => a.status === 'deployed').length;
    const phoneNumbers = new Set(wsAgents.filter(a => a.phone_number).map(a => a.phone_number)).size;
    
    // Determine health status
    let health: 'healthy' | 'warning' | 'error' = 'healthy';
    if (wsAgents.length === 0) health = 'warning';
    if (wsAgents.length > 0 && deployedAgents === 0) health = 'warning';
    if (wsProfiles.length === 0) health = 'error';

    workspaceStats.set(ws.id, {
      users: wsProfiles.length,
      agents: wsAgents.length,
      deployedAgents,
      phoneNumbers,
      recentActivity: wsConversations.length,
      health,
    });
  });

  const totalUsers = profiles?.length || 0;
  const totalAgents = agents?.length || 0;
  const totalDeployed = agents?.filter(a => a.status === 'deployed').length || 0;
  const totalPhoneNumbers = new Set(agents?.filter(a => a.phone_number).map(a => a.phone_number)).size;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-white">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-semibold text-white">Admin Dashboard</h1>
        <p className="text-white/60">
          Signed in as <strong className="text-white">{me?.full_name || auth.user.email}</strong> ·
          <span className="ml-1 font-medium text-orange-500">Superadmin</span>
        </p>
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <div className="mb-2 flex items-center gap-2 text-sm text-white/60">
            <Building2 className="h-4 w-4" />
            <span>Workspaces</span>
          </div>
          <div className="text-3xl font-bold text-orange-500">{workspaces?.length || 0}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <div className="mb-2 flex items-center gap-2 text-sm text-white/60">
            <Users className="h-4 w-4" />
            <span>Total Users</span>
          </div>
          <div className="text-3xl font-bold text-orange-500">{totalUsers}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <div className="mb-2 flex items-center gap-2 text-sm text-white/60">
            <Phone className="h-4 w-4" />
            <span>Deployed Agents</span>
          </div>
          <div className="text-3xl font-bold text-orange-500">{totalDeployed}</div>
          <div className="mt-1 text-xs text-white/50">of {totalAgents} total</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <div className="mb-2 flex items-center gap-2 text-sm text-white/60">
            <MessageSquare className="h-4 w-4" />
            <span>Phone Numbers</span>
          </div>
          <div className="text-3xl font-bold text-orange-500">{totalPhoneNumbers}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <Link
          href="/admin/analytics"
          className="rounded-2xl border border-white/10 bg-black/40 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-orange-500/40 hover:bg-black/30 hover:shadow-xl"
        >
          <h3 className="mb-2 text-xl font-semibold text-white">Analytics & Reports</h3>
          <p className="text-white/70">View platform-wide analytics and reporting</p>
        </Link>
        <Link
          href="/admin/invites"
          className="rounded-2xl border border-white/10 bg-black/40 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-orange-500/40 hover:bg-black/30 hover:shadow-xl"
        >
          <h3 className="mb-2 text-xl font-semibold text-white">Manage Invites</h3>
          <p className="text-white/70">Create and manage workspace invitations</p>
        </Link>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
          <h3 className="mb-2 text-xl font-semibold text-white">Account Management</h3>
          <p className="text-white/70">Create and manage client accounts (Coming soon)</p>
        </div>
      </div>

      {/* Workspaces Table */}
      <section className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">All Workspaces</h2>
          <div className="text-sm text-white/60">
            {workspaces?.length || 0} workspace{workspaces?.length !== 1 ? 's' : ''}
          </div>
        </div>
        {!workspaces || workspaces.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-white/60">No workspaces yet.</p>
            <p className="mt-2 text-sm text-white/50">Workspaces will appear here as users sign up.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white/80">
              <thead className="border-b border-white/10 text-white/60">
                <tr className="text-left">
                  <th className="py-4 pr-4 font-medium">Status</th>
                  <th className="py-4 pr-4 font-medium">Workspace Name</th>
                  <th className="py-4 pr-4 font-medium">Users</th>
                  <th className="py-4 pr-4 font-medium">Agents</th>
                  <th className="py-4 pr-4 font-medium">Deployed</th>
                  <th className="py-4 pr-4 font-medium">Phone #s</th>
                  <th className="py-4 pr-4 font-medium">Activity (7d)</th>
                  <th className="py-4 pr-4 font-medium">Created</th>
                  <th className="py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {workspaces.map((workspace) => {
                  const stats = workspaceStats.get(workspace.id) || {
                    users: 0,
                    agents: 0,
                    deployedAgents: 0,
                    phoneNumbers: 0,
                    recentActivity: 0,
                    health: 'warning' as const,
                  };
                  const owner = profiles?.find(p => p.id === workspace.owner_id);
                  const ownerEmail = owner ? emailMap.get(owner.id) : null;
                  
                  return (
                    <tr key={workspace.id} className="transition-colors hover:bg-white/5">
                      <td className="py-4 pr-4">
                        {stats.health === 'healthy' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : stats.health === 'warning' ? (
                          <AlertCircle className="h-5 w-5 text-yellow-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        <div className="font-medium text-white">{workspace.name}</div>
                        {owner && (
                          <div className="text-xs text-white/50">{owner.full_name || ownerEmail || 'Unknown'}</div>
                        )}
                      </td>
                      <td className="py-4 pr-4 text-white/70">{stats.users}</td>
                      <td className="py-4 pr-4 text-white/70">{stats.agents}</td>
                      <td className="py-4 pr-4">
                        <span className={stats.deployedAgents > 0 ? "text-green-400" : "text-white/50"}>
                          {stats.deployedAgents}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-white/70">{stats.phoneNumbers}</td>
                      <td className="py-4 pr-4 text-white/70">{stats.recentActivity}</td>
                      <td className="py-4 pr-4 text-white/60">
                        {new Date(workspace.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4">
                        <Link
                          href={`/gigaai?workspace=${workspace.id}`}
                          className="text-xs text-orange-500 hover:text-orange-400 transition"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
