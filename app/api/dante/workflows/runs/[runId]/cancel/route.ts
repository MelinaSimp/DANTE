// app/api/dante/workflows/runs/[runId]/cancel/route.ts
//
// POST /api/dante/workflows/runs/:runId/cancel
//
// Cancels a queued or running workflow run. Queued runs are
// cancelled immediately. Running runs are marked cancelled and
// the BFS loop checks for this flag every 3 nodes.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  // Auth: session-based, check workspace membership
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  // Fetch the run and verify workspace ownership
  const { data: run } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("id, status, workspace_id")
    .eq("id", runId)
    .maybeSingle();

  if (!run)
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.workspace_id !== profile.workspace_id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only cancel runs that are still active
  if (!["queued", "running"].includes(run.status)) {
    return NextResponse.json(
      {
        error: `Cannot cancel a run with status "${run.status}". Only queued or running runs can be cancelled.`,
      },
      { status: 409 },
    );
  }

  // Parse optional reason from body
  let reason = "Cancelled by user";
  try {
    const body = await req.json();
    if (body.reason && typeof body.reason === "string") {
      reason = body.reason;
    }
  } catch {
    // No body or invalid JSON -- use default reason
  }

  // Cancel the run
  const { error: updateErr } = await supabaseAdmin
    .from("dante_workflow_runs")
    .update({
      status: "cancelled",
      error: reason,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .in("status", ["queued", "running"]);

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cancelled: true,
    run_id: runId,
    reason,
  });
}
