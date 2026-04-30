// Planning cron — runs all four planning analyzers across every
// contact in every workspace. Wired in vercel.json to fire weekly
// on Mondays at 5am UTC.
//
// Auth: Authorization: Bearer <CRON_SECRET> (or ?key=…). Same
// guardrail as /api/dante/cron/tick.
//
// We iterate workspaces because the analyzers are workspace-scoped
// (they read planning_signals + planning_runs, both scoped). One
// run row per workspace per fire — the run rows are useful for
// "what did we find this week vs last week" diffs.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runPlanningForWorkspace } from "@/lib/planning/runners";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;

  if (secret && bearer !== secret && url.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: workspaces, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, industry");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Only the financial-advisor vertical needs these planning agents.
  // Realtor workspaces (industry === 'realtor') get nothing useful
  // out of Roth / RMD / TLH. Skip them to save LLM quota and avoid
  // surfacing irrelevant signals.
  const advisorWorkspaces = (workspaces || []).filter(
    (w: any) => w.industry === "financial_advisor" || w.industry == null,
  );

  const results: Array<{
    workspace: string;
    runId: string;
    contacts: number;
    signals: number;
    errors: number;
  }> = [];

  for (const ws of advisorWorkspaces) {
    try {
      const r = await runPlanningForWorkspace(ws.id, "cron");
      results.push({
        workspace: ws.name || ws.id,
        runId: r.runId,
        contacts: r.contactCount,
        signals: r.signalCount,
        errors: r.errors,
      });
    } catch (err: any) {
      results.push({
        workspace: ws.name || ws.id,
        runId: "",
        contacts: 0,
        signals: 0,
        errors: 1,
      });
      console.error(`[planning-cron] workspace ${ws.id} failed:`, err?.message);
    }
  }

  return NextResponse.json({ ok: true, runs: results });
}

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
