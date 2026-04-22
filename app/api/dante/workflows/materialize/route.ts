// app/api/dante/workflows/materialize/route.ts
//
// Phase 3 of the book-aware generate flow: the advisor picked one of
// the three proposals from /propose, we now turn that proposal into a
// runnable workflow graph and write it to dante_workflows.
//
// The client sends back the proposal and book summary it received
// from /propose — we trust them (both are derived from server-side
// data a moment ago) and just forward them to generateWorkflow. If
// either is missing or malformed we fall back to prompt-only mode so
// the route still works.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateWorkflow } from "@/lib/dante/workflow-ai";
import type { WorkflowProposal } from "@/lib/dante/workflow-proposals";
import type { BookSummary } from "@/lib/dante/book-summary";
import { requireActiveBilling } from "@/lib/billing/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const gate = await requireActiveBilling(profile.workspace_id);
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const proposal = body.proposal as WorkflowProposal | undefined;
  const bookSummary = body.book_summary as BookSummary | undefined;

  if (!prompt && !proposal?.enriched_prompt) {
    return NextResponse.json(
      { error: "Prompt or proposal required" },
      { status: 400 }
    );
  }

  let generated;
  try {
    generated = await generateWorkflow({
      prompt: prompt || proposal?.enriched_prompt || "",
      proposal,
      bookSummary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const triggerNode = generated.graph.nodes.find((n) =>
    n.type.startsWith("trigger_")
  );
  const triggerTag =
    triggerNode?.type === "trigger_cron"
      ? { type: "cron" }
      : triggerNode?.type === "trigger_webhook"
      ? { type: "webhook" }
      : { type: "manual" };

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .insert({
      workspace_id: profile.workspace_id,
      created_by: user.id,
      name: generated.name,
      description: generated.description || null,
      trigger: triggerTag,
      steps: [],
      graph: generated.graph,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ workflow: data, prompt, proposal_id: proposal?.id });
}
