// POST /api/compliance/v2/marketing/[id]/scan
//
// Re-runs the compliance scanner against the body of a marketing
// submission and writes the result back as scan_result + scan_severity.
// Useful when the advisor edits the draft after first submission, or
// when the CCO wants a fresh pass before approving.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scanForCompliance } from "@/lib/compliance/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const { data: row, error: getErr } = await supabaseAdmin
    .from("compliance_marketing_reviews")
    .select("id, body, title, channel, intended_audience")
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (getErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await scanForCompliance({
    text: (row as any).body || "",
    contextLabel: `Marketing — ${(row as any).channel} — "${(row as any).title}" — audience: ${(row as any).intended_audience || "unspecified"}`,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
  });

  // Highest severity in the scan determines the chip.
  const severityRank: Record<string, number> = { info: 0, warn: 1, block: 2 };
  let highest: "info" | "warn" | "block" | null = null;
  for (const f of result.flags) {
    if (!highest || severityRank[f.severity] > severityRank[highest]) {
      highest = f.severity;
    }
  }

  await supabaseAdmin
    .from("compliance_marketing_reviews")
    .update({
      scan_result: result,
      scan_severity: highest,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id);

  return NextResponse.json({
    flags_count: result.flags.length,
    highest_severity: highest,
    rules_fired: result.rulesFired,
    llm_called: result.llmCalled,
    duration_ms: result.durationMs,
  });
}
