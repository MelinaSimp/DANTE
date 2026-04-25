// /api/dante/skills/run — invoke a workspace skill ad-hoc.
//
// Body: { name: "draft_review_meeting_recap", input: {...} }
//
// Respects the skill's auto_approve flag — non-auto-approved skills
// run with simulate=true so mutating tools (email.send, clients.update)
// return "would have done X" payloads instead of executing. To
// actually mutate, the user passes simulate=false explicitly AND the
// skill must have auto_approve=true OR the request body must include
// `approved: true` (review-and-approve semantics for client-facing
// copy).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { runSkill } from "@/lib/dante/skills";
import type { StepLogEntry } from "@/lib/dante/workflow-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const input = (body.input as Record<string, unknown>) || {};
  // Default simulate=true for safety. The skill runner has its own
  // simulate-forcing logic for non-auto-approved skills, so even
  // if the caller passes simulate=false explicitly, mutation only
  // fires if the skill is approved-by-default OR the body includes
  // approved=true (which we honor by leaving simulate alone).
  const simulate = body.simulate !== false || body.approved !== true;

  const log: StepLogEntry[] = [];
  try {
    const result = await runSkill({
      workspaceId: profile.workspace_id,
      name,
      input,
      simulate,
      runId: `manual_${Date.now()}`,
      log,
      parentStepId: "manual",
    });
    return NextResponse.json({ ok: true, result, trace: log, simulate });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "skill_failed",
        trace: log,
      },
      { status: 500 },
    );
  }
}
