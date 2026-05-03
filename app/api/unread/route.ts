// app/api/unread/route.ts
//
// Phase 3 W3.1 — unread badge counts.
//
//   GET  /api/unread                       returns counts by category
//   POST /api/unread/mark-read             body: { resource_type, resource_id }
//   POST /api/unread/mark-all-read         body: { resource_type }
//
// Reads from user_read_markers (per-user marker table) joined
// against the source tables. Counts are computed server-side so
// the nav doesn't have to fetch every row to figure out badges.
//
// Categories surfaced:
//   review_queue  — pending outbound_review_queue rows
//   memory_review — pending dante_memory rows (review_status='pending')
//
// Adding a new category is a small extension here + a corresponding
// resource_type string in user_read_markers. No schema changes
// needed.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface UnreadCounts {
  review_queue: number;
  memory_review: number;
  total: number;
}

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  // For each category we want: rows visible to this workspace +
  // not-read by this user. We do this in two queries instead of
  // joining (Supabase RPC would be cleaner but adds a migration
  // dependency — counts at this scale are small).

  const counts: UnreadCounts = {
    review_queue: 0,
    memory_review: 0,
    total: 0,
  };

  // ── outbound review queue ──
  const [pendingOutbound, readOutbound] = await Promise.all([
    supabaseAdmin
      .from("outbound_review_queue")
      .select("id", { count: "exact", head: false })
      .eq("workspace_id", profile.workspace_id)
      .eq("review_status", "pending")
      .limit(500),
    supabaseAdmin
      .from("user_read_markers")
      .select("resource_id")
      .eq("user_id", user.id)
      .eq("workspace_id", profile.workspace_id)
      .eq("resource_type", "review_queue_item"),
  ]);
  const readOutboundIds = new Set(
    (readOutbound.data || []).map((r: { resource_id: string }) => r.resource_id),
  );
  counts.review_queue = (pendingOutbound.data || []).filter(
    (r: { id: string }) => !readOutboundIds.has(r.id),
  ).length;

  // ── memory review ──
  const [pendingMem, readMem] = await Promise.all([
    supabaseAdmin
      .from("dante_memory")
      .select("id")
      .eq("workspace_id", profile.workspace_id)
      .eq("review_status", "pending")
      .is("superseded_by", null)
      .is("deleted_at", null)
      .limit(500),
    supabaseAdmin
      .from("user_read_markers")
      .select("resource_id")
      .eq("user_id", user.id)
      .eq("workspace_id", profile.workspace_id)
      .eq("resource_type", "memory_review"),
  ]);
  const readMemIds = new Set(
    (readMem.data || []).map((r: { resource_id: string }) => r.resource_id),
  );
  counts.memory_review = (pendingMem.data || []).filter(
    (r: { id: string }) => !readMemIds.has(r.id),
  ).length;

  counts.total = counts.review_queue + counts.memory_review;
  return NextResponse.json(counts);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  const body = (await req.json().catch(() => null)) as {
    resource_type?: string;
    resource_id?: string;
    resource_ids?: string[];
  } | null;
  if (!body?.resource_type) return jsonError(400, "resource_type required");

  const ids = body.resource_id
    ? [body.resource_id]
    : Array.isArray(body.resource_ids)
      ? body.resource_ids
      : [];
  if (ids.length === 0) return jsonError(400, "resource_id or resource_ids required");
  if (ids.length > 500) return jsonError(400, "too_many_ids");

  const nowIso = new Date().toISOString();
  const rows = ids.map((id) => ({
    user_id: user.id,
    workspace_id: profile.workspace_id,
    resource_type: body.resource_type,
    resource_id: id,
    read_at: nowIso,
  }));
  const { error } = await supabaseAdmin
    .from("user_read_markers")
    .upsert(rows, { onConflict: "user_id,resource_type,resource_id" });
  if (error) return jsonError(500, error.message);

  return NextResponse.json({ marked: rows.length });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
