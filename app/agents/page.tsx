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
      <div
        className="min-h-screen"
        style={{ background: "var(--canvas)" }}
      >
        <div className="mx-auto max-w-3xl px-8 py-16">
          <div
            className="label-section mb-4"
            style={{ color: "var(--ink-muted)" }}
          >
            Agents
          </div>
          <h1
            className="heading-display mb-8"
            style={{ fontSize: 44, color: "var(--ink)" }}
          >
            Agent Builder
          </h1>
          <div
            className="px-6 py-5"
            style={{
              background: "var(--danger-soft)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--r-card)",
              color: "var(--danger)",
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            No workspace found. Please contact your administrator.
          </div>
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
