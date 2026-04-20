// app/api/dante/workflows/[workflowId]/webhook-token/route.ts
//
// POST → mint (or fetch) a webhook token for this workflow. The token
// is the secret — holding it is sufficient to trigger the workflow via
// /api/dante/hooks/<token>. If one already exists for the workflow we
// return it rather than rotating; rotation is a separate explicit op.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

async function requireOwnership(workflowId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) {
    return { error: NextResponse.json({ error: "No workspace" }, { status: 400 }) };
  }
  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, workspace_id")
    .eq("id", workflowId).maybeSingle();
  if (!wf || wf.workspace_id !== profile.workspace_id) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { workspaceId: profile.workspace_id as string };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const ctx = await requireOwnership(workflowId);
  if ("error" in ctx) return ctx.error;

  const { data } = await supabaseAdmin
    .from("dante_webhook_tokens")
    .select("token")
    .eq("workflow_id", workflowId)
    .maybeSingle();

  return NextResponse.json({ token: data?.token ?? null });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const ctx = await requireOwnership(workflowId);
  if ("error" in ctx) return ctx.error;

  // Reuse if one exists.
  const { data: existing } = await supabaseAdmin
    .from("dante_webhook_tokens")
    .select("token")
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (existing?.token) return NextResponse.json({ token: existing.token });

  // 32 random bytes → URL-safe base64 (~43 chars) is plenty of entropy.
  const token = randomBytes(32).toString("base64url");

  const { error } = await supabaseAdmin
    .from("dante_webhook_tokens")
    .insert({
      token,
      workflow_id: workflowId,
      workspace_id: ctx.workspaceId,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token });
}
