// POST /api/integrations/[provider]/disconnect
//
// Marks the connection revoked and clears credentials. Doesn't
// delete the row — keeps the audit trail of "this was once connected
// from <date> to <date>" and lets the user reconnect cleanly later.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;
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
  if (!isWorkspaceAdmin(profile.role)) {
    return NextResponse.json(
      { error: "Workspace admin role required" },
      { status: 403 }
    );
  }

  const { error } = await supabaseAdmin
    .from("integration_connections")
    .update({
      status: "revoked",
      credentials: {},
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", profile.workspace_id)
    .eq("provider", providerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAuditEvent({
    action: "integration.disconnect",
    actorUserId: user.id,
    workspaceId: profile.workspace_id,
    entityType: "integration_connection",
    entityId: providerId,
    metadata: { provider: providerId },
    request: req,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
