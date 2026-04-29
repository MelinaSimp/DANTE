// GET /api/audit
//
// Query the workspace's audit_events with filters. Returns paginated
// rows ordered by created_at desc.
//
// Query params:
//   q           — full-text-ish: matches against action / entity_type /
//                  actor_label / entity_id (case-insensitive contains)
//   action      — exact action match, e.g. 'email.send'. Supports
//                  trailing '.*' for namespace prefix ('email.*').
//   actor       — actor_user_id (uuid) for filtering "everything user X did"
//   entity_type — narrow to one entity type
//   since/until — ISO timestamps (inclusive)
//   limit       — 1..200, default 50
//   before      — pagination cursor: created_at of the last seen row

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json([]);

  const url = req.nextUrl;
  const q = url.searchParams.get("q")?.trim() || "";
  const action = url.searchParams.get("action")?.trim() || "";
  const actor = url.searchParams.get("actor")?.trim() || "";
  const entityType = url.searchParams.get("entity_type")?.trim() || "";
  const since = url.searchParams.get("since")?.trim() || "";
  const until = url.searchParams.get("until")?.trim() || "";
  const before = url.searchParams.get("before")?.trim() || "";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1),
    200,
  );

  let query = supabase
    .from("audit_events")
    .select(
      "id, actor_user_id, actor_kind, actor_label, action, entity_type, entity_id, metadata, ip_address, created_at",
    )
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(limit);

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
  if (before) query = query.lt("created_at", before);
  if (q) {
    // Postgres ILIKE across the searchable text columns. The narrow
    // index on (workspace_id, created_at) handles the heavy lifting;
    // these filters apply per-page.
    const pattern = `%${q.replace(/%/g, "")}%`;
    query = query.or(
      `action.ilike.${pattern},entity_type.ilike.${pattern},actor_label.ilike.${pattern},entity_id.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[audit] GET:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data || []);
}
