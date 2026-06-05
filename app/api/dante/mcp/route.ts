// app/api/dante/mcp/route.ts
//
// List the MCP servers registered to this workspace. Used by the
// Settings → Integrations page to render connect / disconnect state
// for known MCP connectors (n8n today, more later).
//
// Auth payloads are NEVER returned — only id, name, url, status, and
// tool count. The agent loop reads the auth blob server-side.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface McpServerSummary {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  approval_status: "pending" | "approved" | "rejected";
  tool_count: number;
  catalog_fetched_at: string | null;
  created_at: string;
}

export async function GET() {
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
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("mcp_servers")
    .select(
      "id, name, url, enabled, approval_status, tools_catalog, catalog_fetched_at, created_at",
    )
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const servers: McpServerSummary[] = (data || []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    enabled: row.enabled as boolean,
    approval_status: row.approval_status as McpServerSummary["approval_status"],
    tool_count: Array.isArray(row.tools_catalog) ? row.tools_catalog.length : 0,
    catalog_fetched_at: (row.catalog_fetched_at as string | null) ?? null,
    created_at: row.created_at as string,
  }));

  return NextResponse.json({ servers });
}
