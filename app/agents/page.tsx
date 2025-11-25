import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AgentBuilderClient from "./AgentBuilderClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-white">
        <h1 className="mb-6 text-3xl font-semibold">Agent Builder</h1>
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-yellow-50">
          <p>No workspace found. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  // Fetch agents for this workspace
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, modality, status, description, created_at, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  return (
    <AgentBuilderClient
      workspaceId={profile.workspace_id}
      initialAgents={agents ?? []}
    />
  );
}












