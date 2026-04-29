// GET /api/audit/export
//
// CSV export of the workspace's audit log. Streams up to 50,000 rows
// matching the same filter shape as /api/audit; anything bigger
// should land via a backgrounded export, which we'll add when a
// customer hits the cap.
//
// Response is text/csv with a workspace-scoped filename so the
// download tab in the user's browser doesn't collide between
// workspaces.

import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ROWS = 50_000;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return new Response(JSON.stringify({ error: "No workspace" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = req.nextUrl;
  const action = url.searchParams.get("action")?.trim() || "";
  const actor = url.searchParams.get("actor")?.trim() || "";
  const entityType = url.searchParams.get("entity_type")?.trim() || "";
  const since = url.searchParams.get("since")?.trim() || "";
  const until = url.searchParams.get("until")?.trim() || "";

  let query = supabase
    .from("audit_events")
    .select(
      "id, actor_user_id, actor_kind, actor_label, action, entity_type, entity_id, metadata, ip_address, user_agent, created_at",
    )
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (action) {
    if (action.endsWith(".*")) {
      query = query.like("action", action.replace(".*", ".") + "%");
    } else {
      query = query.eq("action", action);
    }
  }
  if (actor) query = query.eq("actor_user_id", actor);
  if (entityType) query = query.eq("entity_type", entityType);
  if (since) query = query.gte("created_at", since);
  if (until) query = query.lte("created_at", until);

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = [
    "created_at",
    "actor_kind",
    "actor_user_id",
    "actor_label",
    "action",
    "entity_type",
    "entity_id",
    "metadata",
    "ip_address",
    "user_agent",
  ];

  const lines: string[] = [headers.join(",")];
  for (const row of data || []) {
    const r = row as Record<string, unknown>;
    lines.push(
      [
        csvEscape(r.created_at),
        csvEscape(r.actor_kind),
        csvEscape(r.actor_user_id),
        csvEscape(r.actor_label),
        csvEscape(r.action),
        csvEscape(r.entity_type),
        csvEscape(r.entity_id),
        csvEscape(r.metadata),
        csvEscape(r.ip_address),
        csvEscape(r.user_agent),
      ].join(","),
    );
  }
  const csv = lines.join("\n");

  const ts = new Date().toISOString().slice(0, 10);
  const filename = `drift-audit-${profile.workspace_id.slice(0, 8)}-${ts}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
