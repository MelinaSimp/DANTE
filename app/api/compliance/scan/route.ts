// POST /api/compliance/scan
//
// Body: {
//   source_type: 'note' | 'email' | 'sms' | 'call_summary' | 'draft',
//   source_id: string,   // row id in the source table (or ad-hoc for drafts)
//   text: string,        // content to scan
//   contextLabel?: string
// }
//
// Runs the deterministic + LLM compliance scan, persists each flag to
// compliance_flags (workspace-scoped), and returns the flags so the UI
// can show them inline.
//
// If the same (source_type, source_id, rule_id) already has a dismissed
// flag, we DON'T re-raise it — dismissals are sticky. The user already
// said "false positive" once.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scanForCompliance } from "@/lib/compliance/scan";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const wid = profile.workspace_id;

  const body = await req.json().catch(() => ({}));
  const { source_type, source_id, text, contextLabel } = body || {};
  if (!source_type || !source_id || typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { error: "source_type, source_id, and text are required" },
      { status: 400 }
    );
  }

  // Pull dismissed rule_ids for this (source_type, source_id) so we
  // can filter them out — dismissals are sticky.
  const { data: existing } = await supabaseAdmin
    .from("compliance_flags")
    .select("rule_id, status")
    .eq("workspace_id", wid)
    .eq("source_type", source_type)
    .eq("source_id", source_id);
  const dismissedRuleIds = new Set(
    (existing || [])
      .filter((f: any) => f.status === "dismissed" && f.rule_id)
      .map((f: any) => f.rule_id as string)
  );

  const scan = await scanForCompliance({
    text,
    contextLabel,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
  });

  const fresh = scan.flags.filter(
    (f) => !f.rule_id || !dismissedRuleIds.has(f.rule_id)
  );

  if (fresh.length > 0) {
    const rows = fresh.map((f) => ({
      workspace_id: wid,
      source_type,
      source_id,
      scanned_text: text,
      layer: f.layer,
      rule_id: f.rule_id,
      severity: f.severity,
      message: f.message,
      citation_refs: f.citations,
      status: "pending" as const,
    }));
    const { error: insErr } = await supabaseAdmin
      .from("compliance_flags")
      .insert(rows);
    if (insErr) {
      return NextResponse.json(
        { error: `Failed to persist flags: ${insErr.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    flags: fresh,
    skippedDismissed: scan.flags.length - fresh.length,
    rulesFired: scan.rulesFired,
    llmCalled: scan.llmCalled,
    durationMs: scan.durationMs,
  });
}
