// POST /api/dante/workflows/runs/<runId>/dismiss
// Soft-dismiss a single run result so it leaves the Recent-results feed
// and the dashboard digest. Keeps the row (and its traces) for audit.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("dante_workflow_runs")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("workspace_id", profile.workspace_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
