// app/api/admin/mcp-servers/route.ts
//
// Phase 3 W3.8 — workspace-admin allowlist gate for MCP servers.
//
//   GET  /api/admin/mcp-servers                   list with approval status
//   POST /api/admin/mcp-servers/approve           approve a server
//   POST /api/admin/mcp-servers/reject            reject a server
//
// MCP servers are how Drift extends its tool catalog with
// third-party endpoints. Without a gate, any workspace member can
// register an arbitrary endpoint that receives every tool-call
// payload — i.e. client PII potentially walking out of the
// workspace. This route gates the addition behind workspace-admin
// approval and audit-logs every transition.
//
// The actual server creation (POST /api/dante/mcp/...) already
// exists; this route only flips approval_status. Rejected servers
// stay in the table for audit but contribute zero tools (the
// `approval_status='approved'` filter in lib/mcp/registry.ts loads
// nothing).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ApprovalBody {
  server_id: string;
  action: "approve" | "reject";
  note?: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");
  // Use the new RBAC role column (Phase 3+ migration). Workspace
  // admin = role='admin'; cross-workspace superadmin still bypasses.
  if ((profile as { role?: string }).role !== "admin" && !(profile as { is_superadmin?: boolean }).is_superadmin) {
    return jsonError(403, "admin_only");
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // pending|approved|rejected (optional)

  let query = supabaseAdmin
    .from("mcp_servers")
    .select(
      "id, name, url, enabled, approval_status, approved_by, approved_at, approval_note, redaction_policy, tools_catalog, catalog_fetched_at, created_at",
    )
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });
  if (status === "pending" || status === "approved" || status === "rejected") {
    query = query.eq("approval_status", status);
  }

  const { data, error } = await query;
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");
  // Use the new RBAC role column (Phase 3+ migration). Workspace
  // admin = role='admin'; cross-workspace superadmin still bypasses.
  if ((profile as { role?: string }).role !== "admin" && !(profile as { is_superadmin?: boolean }).is_superadmin) {
    return jsonError(403, "admin_only");
  }

  const body = (await req.json().catch(() => null)) as ApprovalBody | null;
  if (!body?.server_id) return jsonError(400, "server_id required");
  if (body.action !== "approve" && body.action !== "reject") {
    return jsonError(400, "action must be approve|reject");
  }

  const newStatus = body.action === "approve" ? "approved" : "rejected";
  const note = (body.note || "").trim().slice(0, 500) || null;
  const nowIso = new Date().toISOString();

  const { data: updated, error } = await supabaseAdmin
    .from("mcp_servers")
    .update({
      approval_status: newStatus,
      approved_by: user.id,
      approved_at: nowIso,
      approval_note: note,
    })
    .eq("id", body.server_id)
    .eq("workspace_id", profile.workspace_id)
    .select("id, name")
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!updated) return jsonError(404, "server_not_found");

  // Audit log — a server going from pending → approved / rejected
  // is exactly the kind of event a compliance review will ask
  // about ("who approved access to this third-party endpoint").
  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    action: `mcp_server.${body.action}`,
    resource_type: "mcp_server",
    resource_id: (updated as { id: string }).id,
    metadata: {
      name: (updated as { name: string }).name,
      note,
      approved_at: nowIso,
    },
    timestamp: nowIso,
  });

  return NextResponse.json({ ok: true, status: newStatus });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
