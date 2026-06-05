// GET  /api/dante/evals — list eval suites for the workspace
// POST /api/dante/evals — create a new eval suite
//
// Eval suites are collections of test cases used to measure
// workflow and agent quality over time.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOwner } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { data: suites } = await supabaseAdmin
    .from("dante_eval_suites")
    .select(`
      id, name, description, eval_type, workflow_id, tags,
      created_at, updated_at,
      dante_eval_cases(count)
    `)
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  // Also fetch latest run for each suite
  const suiteIds = (suites || []).map((s: any) => s.id);
  const { data: latestRuns } = suiteIds.length > 0
    ? await supabaseAdmin
        .from("dante_eval_runs")
        .select("suite_id, score, status, finished_at, passed, failed, total_cases")
        .in("suite_id", suiteIds)
        .eq("status", "completed")
        .order("finished_at", { ascending: false })
    : { data: [] };

  // Group latest run by suite (first one per suite_id is the latest)
  const latestBySuite: Record<string, any> = {};
  for (const run of latestRuns || []) {
    if (!latestBySuite[run.suite_id]) {
      latestBySuite[run.suite_id] = run;
    }
  }

  const enriched = (suites || []).map((s: any) => ({
    ...s,
    case_count: s.dante_eval_cases?.[0]?.count || 0,
    latest_run: latestBySuite[s.id] || null,
  }));

  return NextResponse.json({ suites: enriched });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!isOwner(profile.role)) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, eval_type, workflow_id, tags, cases } = body;

  if (!name || !eval_type) {
    return NextResponse.json(
      { error: "name and eval_type are required" },
      { status: 400 },
    );
  }

  // Create suite
  const { data: suite, error: suiteErr } = await supabaseAdmin
    .from("dante_eval_suites")
    .insert({
      workspace_id: profile.workspace_id,
      name,
      description: description || null,
      eval_type,
      workflow_id: workflow_id || null,
      tags: tags || [],
      created_by: user.id,
    })
    .select("id")
    .single();

  if (suiteErr || !suite) {
    return NextResponse.json(
      { error: suiteErr?.message || "Failed to create suite" },
      { status: 500 },
    );
  }

  // Insert cases if provided inline
  if (Array.isArray(cases) && cases.length > 0) {
    const caseRows = cases.map((c: any) => ({
      suite_id: suite.id,
      name: c.name || "Untitled case",
      input: c.input || {},
      expected: c.expected || null,
      assertions: c.assertions || [],
      weight: c.weight || 1.0,
      tags: c.tags || [],
    }));

    await supabaseAdmin.from("dante_eval_cases").insert(caseRows);
  }

  return NextResponse.json({ suite_id: suite.id }, { status: 201 });
}
