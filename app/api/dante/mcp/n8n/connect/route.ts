// app/api/dante/mcp/n8n/connect/route.ts
//
// Connect an n8n MCP server to this workspace so Dante can build
// workflows in the user's n8n instance directly (vs. dumping a JSON
// spec in chat — the v3.7 system-prompt change that motivated this
// route).
//
// Flow:
//   1. Workspace-admin only (same gate as /api/admin/mcp-servers).
//   2. Validate URL is HTTPS.
//   3. Call tools/list against the endpoint to verify the API key
//      works AND populate the cached catalog. A 401/403/404 here
//      means we tell the user their credentials are wrong instead
//      of silently writing a dead row.
//   4. Upsert the mcp_servers row with name='n8n', auth bearer
//      token, and approval_status='approved' (the admin connecting
//      it IS the approver). Audit-log the action.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listTools } from "@/lib/mcp/client";

export const dynamic = "force-dynamic";

interface ConnectBody {
  url?: string;
  api_key?: string;
}

export async function POST(req: NextRequest) {
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
  if (!isAdmin) {
    return NextResponse.json(
      { error: "admin_only", message: "Only workspace admins can connect MCP servers." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as ConnectBody | null;
  const rawUrl = (body?.url || "").trim();
  const apiKey = (body?.api_key || "").trim();
  if (!rawUrl || !apiKey) {
    return NextResponse.json(
      { error: "missing_fields", message: "URL and API key are required." },
      { status: 400 },
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NextResponse.json(
      { error: "invalid_url", message: "URL is malformed." },
      { status: 400 },
    );
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    return NextResponse.json(
      { error: "https_required", message: "MCP endpoint must use HTTPS." },
      { status: 400 },
    );
  }

  const auth = { kind: "bearer", token: apiKey };
  const nowIso = new Date().toISOString();

  // Verify credentials by listing tools BEFORE persisting. A successful
  // tools/list both validates the API key and populates the cache so
  // the agent loop can use it on the next chat turn without a
  // network round-trip.
  let toolsCatalog: unknown[] = [];
  try {
    toolsCatalog = await listTools({ url: url.toString(), auth });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "verify_failed",
        message: `Could not reach the n8n MCP server: ${msg.slice(0, 200)}`,
      },
      { status: 502 },
    );
  }

  const { data: upserted, error } = await supabaseAdmin
    .from("mcp_servers")
    .upsert(
      {
        workspace_id: profile.workspace_id,
        name: "n8n",
        url: url.toString(),
        auth,
        enabled: true,
        tools_catalog: toolsCatalog,
        catalog_fetched_at: nowIso,
        approval_status: "approved",
        approved_by: user.id,
        approved_at: nowIso,
        approval_note: "self-approved by connecting admin",
        updated_at: nowIso,
      },
      { onConflict: "workspace_id,name" },
    )
    .select("id, name")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    action: "mcp_server.connect",
    resource_type: "mcp_server",
    resource_id: (upserted as { id: string } | null)?.id ?? null,
    metadata: {
      name: "n8n",
      url: url.toString(),
      tool_count: toolsCatalog.length,
    },
    timestamp: nowIso,
  });

  return NextResponse.json({
    ok: true,
    server_id: (upserted as { id: string } | null)?.id ?? null,
    tool_count: toolsCatalog.length,
  });
}
