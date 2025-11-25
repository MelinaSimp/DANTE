// app/admin/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";
import { hasSuperadminAccess } from "@/lib/superadmin";

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
  if (!isAdmin) redirect("/");

  // Get all workspaces with stats
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select(`
      id,
      name,
      created_at,
      owner_id
    `)
    .order("created_at", { ascending: false });

  // Get user counts per workspace
  const { data: profiles } = await supabase
    .from("profiles")
    .select("workspace_id");

  const userCounts = new Map<string, number>();
  profiles?.forEach(p => {
    if (p.workspace_id) {
      userCounts.set(p.workspace_id, (userCounts.get(p.workspace_id) || 0) + 1);
    }
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-white">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-semibold text-white">Admin Dashboard</h1>
        <p className="text-white/60">
          Signed in as <strong className="text-white">{me?.full_name || auth.user.email}</strong> ·
          <span className="ml-1 font-medium text-[#7a8dff]">Superadmin</span>
        </p>
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <div className="mb-1 text-sm text-white/60">Total Workspaces</div>
          <div className="text-3xl font-bold text-[#7a8dff]">{workspaces?.length || 0}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <div className="mb-1 text-sm text-white/60">Total Users</div>
          <div className="text-3xl font-bold text-[#7a8dff]">{profiles?.length || 0}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
          <div className="mb-1 text-sm text-white/60">Active Now</div>
          <div className="text-3xl font-bold text-white/40">-</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link
          href="/admin/analytics"
          className="rounded-2xl border border-white/10 bg-black/40 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#3351ff]/40 hover:bg-black/30 hover:shadow-xl"
        >
          <h3 className="mb-2 text-xl font-semibold text-white">Analytics & Reports</h3>
          <p className="text-white/70">View platform-wide analytics and reporting</p>
        </Link>
        <Link
          href="/admin/invites"
          className="rounded-2xl border border-white/10 bg-black/40 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#3351ff]/40 hover:bg-black/30 hover:shadow-xl"
        >
          <h3 className="mb-2 text-xl font-semibold text-white">Manage Invites</h3>
          <p className="text-white/70">Create and manage workspace invitations</p>
        </Link>
      </div>

      {/* Workspaces Table */}
      <section className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
        <h2 className="mb-6 text-xl font-semibold text-white">All Workspaces</h2>
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
                  <th className="py-4 pr-4 font-medium">Workspace Name</th>
                  <th className="py-4 pr-4 font-medium">Users</th>
                  <th className="py-4 pr-4 font-medium">Created</th>
                  <th className="py-4 font-medium">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {workspaces.map((workspace) => (
                  <tr key={workspace.id} className="transition-colors hover:bg-white/5">
                    <td className="py-4 pr-4 font-medium text-white">{workspace.name}</td>
                    <td className="py-4 pr-4 text-white/70">{userCounts.get(workspace.id) || 0}</td>
                    <td className="py-4 pr-4 text-white/60">{new Date(workspace.created_at).toLocaleDateString()}</td>
                    <td className="py-4 font-mono text-xs text-white/40">{workspace.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
