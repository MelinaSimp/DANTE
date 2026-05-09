// app/api/dante/workflows/[workflowId]/proposal/route.ts
//
// Accept / decline a workflow proposal that the chat agent (or
// noticer agent) drafted via the workflow.propose tool.
//
//   POST /api/dante/workflows/<id>/proposal { action: "accept" | "decline" }
//
// On accept: clear proposal_state, set enabled=true. For trigger_at
// or trigger_cron workflows, downstream cron/tick will pick them up
// on its next sweep — the API does not pre-compute next_fire_at, so
// the user can edit timing in the editor before the first fire.
//
// On decline: delete the row. The proposal was never user-owned so
// destruction is the cleaner audit story than a soft-delete column.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ProposalActionBody {
  action?: "accept" | "decline";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  const { workflowId } = await params;
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

  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, workspace_id, proposal_state, enabled")
    .eq("id", workflowId)
    .maybeSingle();

  if (!wf || (wf as { workspace_id: string }).workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if ((wf as { proposal_state: string | null }).proposal_state !== "pending") {
    return NextResponse.json(
      { error: "Workflow is not a pending proposal" },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as ProposalActionBody;
  const action = body.action;

  if (action === "accept") {
    const { error } = await supabaseAdmin
      .from("dante_workflows")
      .update({ proposal_state: null, enabled: true })
      .eq("id", workflowId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "accepted" });
  }

  if (action === "decline") {
    const { error } = await supabaseAdmin
      .from("dante_workflows")
      .delete()
      .eq("id", workflowId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "declined" });
  }

  return NextResponse.json(
    { error: "Body must include action: 'accept' | 'decline'" },
    { status: 400 },
  );
}
