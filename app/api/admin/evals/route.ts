// GET /api/admin/evals
//
// Superadmin endpoint that returns a unified view of all eval runs
// from both systems:
//   1. FiduciaryBench (eval_runs + eval_grades)
//   2. Dante Eval Framework (dante_eval_runs + dante_eval_results)
//
// Also supports POST for submitting human grades to eval_grades.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

async function verifySuperadmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const system = req.nextUrl.searchParams.get("system"); // "fiduciary" | "dante" | null (both)

  const results: Record<string, unknown> = {};

  // ── FiduciaryBench runs ───────────────────────────────────────
  if (!system || system === "fiduciary") {
    const { data: fbRuns } = await supabaseAdmin
      .from("eval_runs")
      .select(
        "id, task_slug, task_version, model, output, prompt_tokens, completion_tokens, total_tokens, duration_ms, auto_answer_quality, auto_source_reliability, auto_grade_notes, triggered_by, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    // Get human grades for these runs
    const runIds = (fbRuns || []).map((r: Record<string, unknown>) => r.id);
    const gradesByRun: Record<string, Array<Record<string, unknown>>> = {};
    if (runIds.length > 0) {
      const { data: grades } = await supabaseAdmin
        .from("eval_grades")
        .select("id, run_id, grader_kind, grader_id, answer_quality, source_reliability, notes, created_at")
        .in("run_id", runIds);
      for (const g of (grades || []) as Array<Record<string, unknown>>) {
        const rid = g.run_id as string;
        if (!gradesByRun[rid]) gradesByRun[rid] = [];
        gradesByRun[rid].push(g);
      }
    }

    results.fiduciary = {
      runs: (fbRuns || []).map((r: Record<string, unknown>) => ({
        ...r,
        grades: gradesByRun[r.id as string] || [],
        has_human_grade: (gradesByRun[r.id as string] || []).some(
          (g) => g.grader_kind === "human",
        ),
      })),
    };
  }

  // ── Dante Eval runs ───────────────────────────────────────────
  if (!system || system === "dante") {
    const { data: danteRuns } = await supabaseAdmin
      .from("dante_eval_runs")
      .select(
        "id, suite_id, workspace_id, model, status, total_cases, passed, failed, score, started_at, finished_at, duration_ms, total_tokens_in, total_tokens_out, estimated_cost_cents, notes, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    // Resolve suite names
    const suiteIds = [
      ...new Set((danteRuns || []).map((r: Record<string, unknown>) => r.suite_id)),
    ];
    const suiteNames: Record<string, string> = {};
    if (suiteIds.length > 0) {
      const { data: suites } = await supabaseAdmin
        .from("dante_eval_suites")
        .select("id, name, workspace_id, eval_type")
        .in("id", suiteIds);
      for (const s of (suites || []) as Array<Record<string, unknown>>) {
        suiteNames[s.id as string] = s.name as string;
      }
    }

    // Resolve workspace names
    const wsIds = [
      ...new Set((danteRuns || []).map((r: Record<string, unknown>) => r.workspace_id)),
    ];
    const wsNames: Record<string, string> = {};
    if (wsIds.length > 0) {
      const { data: workspaces } = await supabaseAdmin
        .from("workspaces")
        .select("id, name")
        .in("id", wsIds);
      for (const w of (workspaces || []) as Array<Record<string, unknown>>) {
        wsNames[w.id as string] = w.name as string;
      }
    }

    results.dante = {
      runs: (danteRuns || []).map((r: Record<string, unknown>) => ({
        ...r,
        suite_name: suiteNames[r.suite_id as string] || "Unknown Suite",
        workspace_name: wsNames[r.workspace_id as string] || "Unknown",
      })),
    };
  }

  // ── Graders directory ──────────────────────────────────────────
  const { data: graders } = await supabaseAdmin
    .from("eval_graders")
    .select("id, display_name, credentials, bio, active")
    .order("display_name");

  results.graders = graders || [];

  return NextResponse.json(results);
}

// POST /api/admin/evals — submit a human grade for a FiduciaryBench run
export async function POST(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { run_id, grader_id, answer_quality, source_reliability, notes } = body;

  if (!run_id) {
    return NextResponse.json({ error: "run_id required" }, { status: 400 });
  }
  if (
    typeof answer_quality !== "number" ||
    answer_quality < 0 ||
    answer_quality > 1
  ) {
    return NextResponse.json(
      { error: "answer_quality must be 0.0-1.0" },
      { status: 400 },
    );
  }
  if (
    typeof source_reliability !== "number" ||
    source_reliability < 0 ||
    source_reliability > 1
  ) {
    return NextResponse.json(
      { error: "source_reliability must be 0.0-1.0" },
      { status: 400 },
    );
  }

  // Verify the run exists
  const { data: run } = await supabaseAdmin
    .from("eval_runs")
    .select("id")
    .eq("id", run_id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { data: grade, error } = await supabaseAdmin
    .from("eval_grades")
    .insert({
      run_id,
      grader_kind: "human",
      grader_id: grader_id || null,
      answer_quality,
      source_reliability,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ grade });
}
