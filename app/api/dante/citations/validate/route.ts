// POST /api/dante/citations/validate
//
// Runs Drift's citation validator over a block of agent output and
// returns the per-claim CitationValidationReport. validateCitations is
// server-only (it re-queries the workspace archive via supabaseAdmin),
// so the workflow editor (a client component) calls this to get the
// verified/flagged breakdown for an agent node's result.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { validateCitations } from "@/lib/dante/citation-validator";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type TraceEntry = { step_id: string; step_name: string; status: string; output?: unknown };

export async function POST(req: NextRequest) {
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

  let body: { responseText?: string; trace?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const responseText = typeof body.responseText === "string" ? body.responseText : "";
  if (!responseText) {
    return NextResponse.json({ error: "responseText is required" }, { status: 400 });
  }
  const trace = (Array.isArray(body.trace) ? body.trace : []) as TraceEntry[];

  try {
    const report = await validateCitations({
      workspaceId: profile.workspace_id,
      responseText,
      trace,
    });
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Citation validation failed";
    console.error("[citations-validate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
