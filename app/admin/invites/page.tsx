// app/admin/invites/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth");

  const { data: me } = await supabase
    .from("profiles")
    .select("id, is_superadmin, full_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!hasSuperadminAccess(auth.user.email, me?.is_superadmin)) redirect("/");

  // Get all workspaces for invitation management
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select(`
      id,
      name,
      created_at,
      owner_id,
      profiles (
        id,
        full_name,
        email
      )
    `)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-white">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-semibold text-white">Manage Invites</h1>
        <p className="text-white/60">
          Create and manage workspace invitations for new users
        </p>
      </div>

      {/* Invitation Form */}
      <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
        <h2 className="mb-6 text-xl font-semibold text-white">Send Invitation</h2>
        <form className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-semibold text-white/70">
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              required
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-white shadow-sm transition focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/40"
              placeholder="user@example.com"
            />
          </div>
          
          <div>
            <label htmlFor="workspace" className="mb-2 block text-sm font-semibold text-white/70">
              Workspace *
            </label>
            <select
              id="workspace"
              required
              className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-white shadow-sm transition focus:border-[#3351ff]/60 focus:outline-none focus:ring-2 focus:ring-[#3351ff]/40"
            >
              <option value="">Select a workspace</option>
              {workspaces?.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-xl bg-[#3351ff] px-6 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:bg-[#4a64ff] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#3351ff]/40"
            >
              Send Invitation
            </button>
          </div>
        </form>
      </div>

      {/* Workspaces Overview */}
      <section className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
        <h2 className="mb-6 text-xl font-semibold text-white">Workspace Overview</h2>
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
                  <th className="py-4 pr-4 font-medium">Owner</th>
                  <th className="py-4 pr-4 font-medium">Created</th>
                  <th className="py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {workspaces.map((workspace) => (
                  <tr key={workspace.id} className="transition-colors hover:bg-white/5">
                    <td className="py-4 pr-4 font-medium text-white">{workspace.name}</td>
                    <td className="py-4 pr-4 text-white/70">
                      {workspace.profiles?.full_name || 'Unknown'}
                    </td>
                    <td className="py-4 pr-4 text-white/60">
                      {new Date(workspace.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4">
                      <button className="font-medium text-[#7a8dff] hover:text-white">
                        View Details
                      </button>
                    </td>
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
