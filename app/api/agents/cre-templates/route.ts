// app/api/agents/cre-templates/route.ts
//
// GET  — list available CRE scenario templates.
// POST — apply a CRE template to an existing agent (sets mode="scenario"
//        + scenario JSONB + first_message + name).

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { CRE_SCENARIO_TEMPLATES } from "@/lib/vapi/cre-scenarios";

export async function GET() {
  return NextResponse.json(
    CRE_SCENARIO_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      suggestedAgentName: t.suggestedAgentName,
      nodeCount: t.scenario.nodes.length,
    })),
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  let body: { agent_id?: string; template_key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agent_id, template_key } = body;
  if (!agent_id || !template_key) {
    return NextResponse.json({ error: "agent_id and template_key required" }, { status: 400 });
  }

  const template = CRE_SCENARIO_TEMPLATES.find((t) => t.key === template_key);
  if (!template) {
    return NextResponse.json({ error: "Unknown template" }, { status: 400 });
  }

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("id, workspace_id")
    .eq("id", agent_id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("agents")
    .update({
      mode: "scenario",
      scenario: template.scenario,
      first_message: template.suggestedFirstMessage,
      name: template.suggestedAgentName,
      description: template.description,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agent_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    agent_id,
    template_key: template.key,
    applied: true,
  });
}
