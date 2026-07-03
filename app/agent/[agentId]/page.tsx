// app/agent/[agentId]/page.tsx
//
// Per-agent configuration — the surface that replaces the old backend
// orb's Instructions + Data Sources panels. This is where you set the
// persona the voice agent uses on every call (company name, what you
// do, tone, rules) and the knowledge base it can quote from.
//
// Before this page existed, `agents.llm_instructions` was edited from
// the orb at /app, which got redirected away during IA consolidation.
// That's why callers could hear "Horizontech Solutions" with no way
// to change it from the UI.

import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import AgentConfigClient from "./AgentConfigClient";
import WidgetPublishCard from "@/components/agent-builder/WidgetPublishCard";

export const dynamic = "force-dynamic";

export default async function AgentConfigPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user!.id)
    .maybeSingle();

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select(
      "id, name, description, llm_instructions, first_message, modality, status, voice_provider, vapi_assistant_id, elevenlabs_voice_id, phone_number, llm_model, mode, scenario, schedule_enabled, schedule, after_hours_transfer_to, widget_enabled, widget_public_id"
    )
    .eq("id", agentId)
    .eq("workspace_id", profile!.workspace_id)
    .maybeSingle();
  if (!agent) notFound();

  const { data: dataSources } = await supabaseAdmin
    .from("agent_data_sources")
    .select("id, name, type, content, file_url, file_size, file_type, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  return (
    <AppShell {...ctx}>
      <AgentConfigClient
        agent={agent}
        initialDataSources={dataSources ?? []}
      />
    </AppShell>
  );
}
