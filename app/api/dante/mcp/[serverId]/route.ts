// app/api/dante/mcp/[serverId]/route.ts
//
// Disconnect a single MCP server (delete the row). Only workspace
// admins may detach a server — same gate as connect. Audit-logged so
// compliance can see who pulled the plug and when.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const { serverId } = await params;
  if (!serverId) return NextResponse.json({ error: "server_id required" }, { status: 400 });

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }
  const isAdmin =
    (profile as { role?: string }).role === "admin" ||
    (profile as { is_superadmin?: boolean }).is_superadmin === true;
  if (!isAdmin) return NextResponse.json({ error: "admin_only" }, { status: 403 });

  const { data: removed, error } = await supabaseAdmin
    .from("mcp_servers")
    .delete()
    .eq("id", serverId)
    .eq("workspace_id", profile.workspace_id)
    .select("id, name")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!removed) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    action: "mcp_server.disconnect",
    resource_type: "mcp_server",
    resource_id: (removed as { id: string }).id,
    metadata: { name: (removed as { name: string }).name },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
