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

  const update: Record<string, unknown> = {
    triage_status: body.action === "promote" ? "promoted" : "dismissed",
    triaged_by: ctx.userId,
    triaged_at: new Date().toISOString(),
  };
  if (body.action === "promote") {
    if (!body.eval_id) return jsonError(400, "eval_id required when promoting");
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
    metadata: { eval_id: body.eval_id, note: body.note ?? null },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
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
