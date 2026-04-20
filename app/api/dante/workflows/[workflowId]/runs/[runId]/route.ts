// app/api/dante/workflows/[workflowId]/runs/[runId]/route.ts
//
// GET → full detail for a single run (log + output + timestamps).
//
// The workflow detail endpoint returns the last 20 runs with just
// status + timestamps so the history drawer renders fast. Expanding
// any row fetches this endpoint for the full log.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string; runId: string }> }
) {
  const { workflowId, runId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Scope the query to (workflow_id, workspace_id) so a user from one
  // workspace can't fetch another workspace's run by guessing the id.
  const { data: run, error } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("id, status, triggered_by, started_at, finished_at, input, output, log, error")
    .eq("id", runId)
    .eq("workflow_id", workflowId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ run });
}
