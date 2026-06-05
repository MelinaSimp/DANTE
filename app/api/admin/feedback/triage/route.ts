// app/api/admin/feedback/triage/route.ts
//
// Phase 8 W8.4 — feedback triage queue.
//
//   GET   /api/admin/feedback/triage?status=pending|promoted|dismissed
//   POST  /api/admin/feedback/triage { feedback_id, action: "promote"|"dismiss", eval_id?, note? }
//
// AI lead reviews pending downvotes weekly. Strong signals get
// "promoted" — the lead authors the corresponding eval task and
// records the slug here. Weak signals get "dismissed" with an
// optional note explaining why.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canApprove, type Role } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await ensureSupervisor();
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const status =
    (url.searchParams.get("status") as "pending" | "promoted" | "dismissed" | null) ?? "pending";

  const { data } = await supabaseAdmin
    .from("chat_feedback")
    .select("id, vote, user_input, agent_output, comment, triage_status, promoted_to_eval_id, created_at, triaged_at, triaged_by")
    .eq("workspace_id", ctx.workspaceId)
    .eq("triage_status", status)
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ items: data ?? [] });
}

interface TriageBody {
  feedback_id?: string;
  action?: "promote" | "dismiss";
  eval_id?: string;
  note?: string;
}

export async function POST(req: NextRequest) {
  const ctx = await ensureSupervisor();
  if (!ctx.ok) return ctx.response;
  const body = (await req.json().catch(() => ({}))) as TriageBody;
  if (!body.feedback_id) return jsonError(400, "feedback_id required");
  if (body.action !== "promote" && body.action !== "dismiss") {
    return jsonError(400, "action must be promote|dismiss");
  }

  // Fetch the feedback item so we can create the eval case
  const { data: feedbackItem } = await supabaseAdmin
    .from("chat_feedback")
    .select("id, user_input, agent_output, comment, workspace_id")
    .eq("id", body.feedback_id)
    .eq("workspace_id", ctx.workspaceId)
    .eq("triage_status", "pending")
    .maybeSingle();
  if (!feedbackItem) return jsonError(404, "feedback item not found or already triaged");

  let evalCaseId: string | null = null;

  if (body.action === "promote") {
    if (!body.eval_id) return jsonError(400, "eval_id required when promoting");

    // Auto-create a Dante eval case from the feedback snapshot.
    // Find or create the "Feedback Regressions" suite for this workspace.
    let suiteId: string;
    const { data: existingSuite } = await supabaseAdmin
      .from("dante_eval_suites")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("name", "Feedback Regressions")
      .maybeSingle();

    if (existingSuite) {
      suiteId = existingSuite.id;
    } else {
      const { data: newSuite, error: suiteErr } = await supabaseAdmin
        .from("dante_eval_suites")
        .insert({
          workspace_id: ctx.workspaceId,
          name: "Feedback Regressions",
          description: "Eval cases auto-created from downvoted chat feedback.",
          eval_type: "agent",
          tags: ["feedback", "regression"],
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (suiteErr || !newSuite) return jsonError(500, suiteErr?.message || "suite create failed");
      suiteId = newSuite.id;
    }

    // Create the eval case from the feedback
    const caseName = body.eval_id;
    const { data: evalCase, error: caseErr } = await supabaseAdmin
      .from("dante_eval_cases")
      .insert({
        suite_id: suiteId,
        name: caseName,
        input: { message: feedbackItem.user_input },
        expected: { ideal_output: feedbackItem.agent_output, note: body.note || null },
        assertions: [
          { type: "llm_grade", threshold: 0.7, rubric: `The user downvoted this response. The new response should be better than the original: "${feedbackItem.agent_output.slice(0, 200)}"` },
        ],
        tags: ["feedback"],
      })
      .select("id")
      .single();
    if (!caseErr && evalCase) evalCaseId = evalCase.id;
  }

  const update: Record<string, unknown> = {
    triage_status: body.action === "promote" ? "promoted" : "dismissed",
    triaged_by: ctx.userId,
    triaged_at: new Date().toISOString(),
  };
  if (body.action === "promote") {
    update.promoted_to_eval_id = body.eval_id;
  }

  const { error } = await supabaseAdmin
    .from("chat_feedback")
    .update(update)
    .eq("id", body.feedback_id)
    .eq("workspace_id", ctx.workspaceId)
    .eq("triage_status", "pending");
  if (error) return jsonError(500, error.message);

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    action: `feedback.${body.action}`,
    resource_type: "chat_feedback",
    resource_id: body.feedback_id,
    metadata: { eval_id: body.eval_id, note: body.note ?? null, eval_case_id: evalCaseId },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, eval_case_id: evalCaseId });
}

interface SupervisorCtx {
  ok: true;
  userId: string;
  workspaceId: string;
}
interface SupervisorFail {
  ok: false;
  response: Response;
}

async function ensureSupervisor(): Promise<SupervisorCtx | SupervisorFail> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: jsonError(401, "unauthorized") };
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return { ok: false, response: jsonError(400, "no_workspace") };
  }
  const role = ((profile as { role?: string }).role ?? "advisor") as Role;
  const isSuper = !!(profile as { is_superadmin?: boolean }).is_superadmin;
  if (!isSuper && !canApprove(role)) {
    return { ok: false, response: jsonError(403, "supervisor_or_admin_only") };
  }
  return { ok: true, userId: user.id, workspaceId: profile.workspace_id };
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
