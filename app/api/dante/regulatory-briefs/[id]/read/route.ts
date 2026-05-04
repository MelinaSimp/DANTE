// app/api/dante/regulatory-briefs/[id]/read/route.ts
//
// Mark a regulatory brief as read for the current workspace.
// Read-tracking is workspace-level (not per-user) — the brief is
// firm-wide context, and the cost of re-flagging it for every
// teammate would mostly be noise. The first user who opens the
// dashboard after a brief lands clears it for the firm.
//
// The RLS policy on the table allows authenticated users in the
// workspace to UPDATE; this route just constrains which columns
// can change (read_at + read_by, never the findings or counts).

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sb = await createServerSupabase();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string | null } | null)
    ?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  // Service-role write so we don't have to round-trip the policy
  // check; we manually constrain the workspace match here. Idempotent
  // — calling twice is fine, the second call is a no-op.
  const { error } = await supabaseAdmin
    .from("regulatory_briefs")
    .update({ read_at: new Date().toISOString(), read_by: user.id })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("read_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
