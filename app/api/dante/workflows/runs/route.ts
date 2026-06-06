import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("dante_workflow_runs")
    .select("id, workflow_id, status, started_at, finished_at, error, output, log, n8n_execution_id, result")
    .eq("workspace_id", profile.workspace_id)
    .in("status", ["success", "error", "completed", "failed", "running"])
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data || [] });
}
