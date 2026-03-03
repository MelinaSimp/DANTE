import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { Building2, CheckCircle2, AlertCircle, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth");

  const { data: me } = await supabase
    .from("profiles")
    .select("id, is_superadmin")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!hasSuperadminAccess(auth.user.email, me?.is_superadmin)) redirect("/home");

  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, created_at, owner_id, enabled_features, plan_status")
    .order("created_at", { ascending: false });

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, workspace_id, full_name");

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const emailMap = new Map<string, string>();
  authUsers?.users.forEach(u => {
    if (u.email) emailMap.set(u.id, u.email);
  });

  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, workspace_id, status, phone_number");

  const { data: conversations } = await supabaseAdmin
    .from("conversations")
    .select("id, workspace_id, created_at")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Building2 className="h-6 w-6 text-purple-500" />
          <h1 className="text-3xl font-bold text-white">All Workspaces</h1>
        </div>
        <p className="text-white/40 text-sm ml-9">
          {workspaces?.length || 0} workspace{workspaces?.length !== 1 ? "s" : ""} registered
        </p>
      </div>

      <div className="rounded-2xl border border-purple-500/20 bg-black overflow-hidden">
        {!workspaces || workspaces.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No workspaces yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-purple-500/10">
                <tr className="text-left text-white/40 text-xs uppercase tracking-wider">
                  <th className="py-4 px-6 font-medium">Health</th>
                  <th className="py-4 px-4 font-medium">Workspace</th>
                  <th className="py-4 px-4 font-medium">Plan</th>
                  <th className="py-4 px-4 font-medium">Users</th>
                  <th className="py-4 px-4 font-medium">Agents</th>
                  <th className="py-4 px-4 font-medium">Deployed</th>
                  <th className="py-4 px-4 font-medium">Phone #s</th>
                  <th className="py-4 px-4 font-medium">Features</th>
                  <th className="py-4 px-4 font-medium">Activity</th>
                  <th className="py-4 px-4 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5">
                {workspaces.map((ws) => {
                  const wsProfiles = profiles?.filter(p => p.workspace_id === ws.id) || [];
                  const wsAgents = agents?.filter(a => a.workspace_id === ws.id) || [];
                  const wsConvos = conversations?.filter(c => c.workspace_id === ws.id) || [];
                  const deployed = wsAgents.filter(a => a.status === "deployed").length;
                  const phones = new Set(wsAgents.filter(a => a.phone_number).map(a => a.phone_number)).size;
                  const owner = profiles?.find(p => p.id === ws.owner_id);
                  const ownerEmail = owner ? emailMap.get(owner.id) : null;
                  const featureCount = (ws.enabled_features || []).length;

                  let health: "healthy" | "warning" | "error" = "healthy";
                  if (wsAgents.length === 0) health = "warning";
                  if (wsAgents.length > 0 && deployed === 0) health = "warning";
                  if (wsProfiles.length === 0) health = "error";

                  const statusColor = ws.plan_status === "active"
                    ? "text-green-400 bg-green-400/10 border-green-400/30"
                    : ws.plan_status === "trial"
                    ? "text-blue-400 bg-blue-400/10 border-blue-400/30"
                    : ws.plan_status === "past_due"
                    ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
                    : "text-red-400 bg-red-400/10 border-red-400/30";

                  return (
                    <tr key={ws.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-6">
                        {health === "healthy" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : health === "warning" ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm font-medium text-white">{ws.name}</div>
                        <div className="text-[11px] text-white/30">{owner?.full_name || ownerEmail || "Unknown"}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${statusColor}`}>
                          {ws.plan_status || "active"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-white/60">{wsProfiles.length}</td>
                      <td className="py-4 px-4 text-white/60">{wsAgents.length}</td>
                      <td className="py-4 px-4">
                        <span className={deployed > 0 ? "text-green-400" : "text-white/30"}>{deployed}</span>
                      </td>
                      <td className="py-4 px-4 text-white/60">{phones}</td>
                      <td className="py-4 px-4">
                        <span className="text-purple-500/80 text-xs">{featureCount}/6</span>
                      </td>
                      <td className="py-4 px-4 text-white/60">{wsConvos.length}</td>
                      <td className="py-4 px-4 text-white/30 text-xs">
                        {new Date(ws.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
