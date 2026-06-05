// POST /api/dante/evals/run — trigger an eval run for a suite.
//
// Accepts { suiteId, model?, notes? }. Returns the run result with
// per-case pass/fail and aggregate score.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isOwner } from "@/lib/rbac";
import { runEvalSuite } from "@/lib/dante/eval/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // eval suites can be slow

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

  let body: { suiteId: string; model?: string; notes?: string } | undefined;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.suiteId) {
    return NextResponse.json({ error: "suiteId is required" }, { status: 400 });
  }

  try {
    const result = await runEvalSuite({
      suiteId: body.suiteId,
      workspaceId: profile.workspace_id,
      triggeredBy: user.id,
      model: body.model,
      notes: body.notes,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
