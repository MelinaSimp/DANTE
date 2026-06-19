import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function resolveWorkspace(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.workspace_id ?? null;
}

export async function GET() {
  const ws = await resolveWorkspace();
  if (!ws) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("id, workflow_id, status, started_at, finished_at, error, output, log, n8n_execution_id")
    .eq("workspace_id", ws)
    .is("dismissed_at", null)
    .in("status", ["success", "error", "completed", "failed", "running"])
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data || [] });
}

// Clear all results from the Recent-results feed (soft-dismiss — rows
// are kept for audit/traces, just hidden from the feed + dashboard).
export async function DELETE() {
  const ws = await resolveWorkspace();
  if (!ws) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from("dante_workflow_runs")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("workspace_id", ws)
    .is("dismissed_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
