// /api/dante/agent/test — fire one agent loop ad-hoc.
//
// Lets advisors (and devs) sanity-check the agent without authoring
// a full workflow. Body shape:
//   {
//     objective: "catch up on Adharsh Mannar before our 3pm",
//     tools?: ["memory.search", "archive.search", ...],
//     contact_id?: "uuid",          // injected into objective context
//     simulate?: true               // default true; mutating tools stub out
//   }
//
// Returns the agent's final answer + the sub-step log so the caller
// can render the reasoning trace. This is also what a "Run agent"
// button in the workflow editor would hit.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { runAgent } from "@/lib/dante/agent";
import type { AgentStep, AgentToolEntry, StepLogEntry } from "@/lib/dante/workflow-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_TOOLS: AgentToolEntry[] = [
  "memory.search",
  "archive.search",
  "vault.cite",
  "clients.query",
];

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const objective = String(body.objective || "").trim();
  if (!objective) {
    return NextResponse.json({ error: "objective is required" }, { status: 400 });
  }

  const tools: AgentToolEntry[] = Array.isArray(body.tools) && body.tools.length > 0
    ? (body.tools as AgentToolEntry[])
    : DEFAULT_TOOLS;

  // Default simulate=true. The advisor can opt into live mutation
  // explicitly, but ad-hoc runs from a test endpoint shouldn't be
  // the way emails get sent.
  const simulate = body.simulate !== false;

  const contextLine = body.contact_id
    ? `\n\nContext: focus on contact ${body.contact_id}.`
    : "";

  const step: AgentStep = {
    id: "test_agent",
    type: "agent",
    name: "Ad-hoc agent test",
    config: {
      objective: objective + contextLine,
      tools,
      max_steps: 10,
      system: body.system,
    },
  };

  const log: StepLogEntry[] = [];
  const runId = `test_${Date.now()}`;

  try {
    const result = await runAgent({
      step,
      workspaceId: profile.workspace_id,
      simulate,
      runId,
      log,
    });
    return NextResponse.json({
      ok: true,
      result,
      trace: log,
      simulate,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "agent_failed",
        trace: log,
      },
      { status: 500 },
    );
  }
}
