// app/api/dante/memory/review/route.ts
//
// Review queue API for AI-written memories (Phase 1 W1.2).
//
//   GET  /api/dante/memory/review      — list pending memories, newest first
//   POST /api/dante/memory/review      — bulk approve / reject by id list
//
// Pending memories are excluded from memory.search by default, so an
// AI-written hallucination ("client mentioned wanting to liquidate
// their Roth") never propagates into subsequent answers until an
// advisor (or designated broker, for realtor workspaces) clicks
// "approve" here.
//
// All mutations write an audit_logs row so a later compliance review
// can answer "who approved this fact, when, and what did they say
// about it." Hard-deleting from this table is intentionally not
// supported — rejected rows stay searchable in the queue with
// review_status='rejected' so the audit trail survives.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ReviewActionBody {
  /** UUIDs of dante_memory rows to act on. */
  ids: string[];
  /** What to do with them. */
  action: "approve" | "reject";
  /** Optional reviewer note attached to every row in the batch. */
  note?: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "pending") as
    | "pending"
    | "approved"
    | "rejected";
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") || 50), 1),
    200,
  );

  const { data, error } = await supabaseAdmin
    .from("dante_memory")
    .select(
      "id, kind, content, subject_contact_id, source_kind, source_id, confidence, created_at, review_status, reviewed_by, reviewed_at, review_note",
    )
    .eq("workspace_id", profile.workspace_id)
    .eq("review_status", status)
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return jsonError(500, error.message);
  return NextResponse.json({ items: data || [], status, count: (data || []).length });
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

  const body = (await req.json().catch(() => null)) as ReviewActionBody | null;
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return jsonError(400, "ids required");
  }
  if (body.action !== "approve" && body.action !== "reject") {
    return jsonError(400, "action must be approve|reject");
  }
  if (body.ids.length > 200) {
    // Keep batches bounded — review-queue UI typically caps at 50.
    return jsonError(400, "too_many_ids");
  }

  const newStatus = body.action === "approve" ? "approved" : "rejected";
  const note = (body.note || "").trim().slice(0, 500) || null;
  const nowIso = new Date().toISOString();

  // Update only rows currently pending — prevents a stale UI from
  // re-flipping an already-approved row. Workspace scope is
  // enforced explicitly even though RLS would catch it; defense in
  // depth on a sensitive table.
  const { data: updated, error } = await supabaseAdmin
    .from("dante_memory")
    .update({
      review_status: newStatus,
      reviewed_by: user.id,
      reviewed_at: nowIso,
      review_note: note,
    })
    .in("id", body.ids)
    .eq("workspace_id", profile.workspace_id)
    .eq("review_status", "pending")
    .select("id");

  if (error) return jsonError(500, error.message);

  // Audit log — one row per reviewed memory. Compliance needs the
  // per-row trail, not just an aggregate "user approved 47
  // memories" event.
  const auditRows = (updated || []).map((row: { id: string }) => ({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    action: `memory.${body.action}`,
    resource_type: "dante_memory",
    resource_id: row.id,
    metadata: { note, reviewed_at: nowIso },
    timestamp: nowIso,
  }));
  if (auditRows.length > 0) {
    const { error: auditErr } = await supabaseAdmin
      .from("audit_logs")
      .insert(auditRows);
    if (auditErr) {
      // Log but don't fail — the primary write succeeded; missing
      // audit row is recoverable. Production should alert on this.
      console.error("[memory review] audit log insert failed:", auditErr.message);
    }
  }

  return NextResponse.json({
    updated: (updated || []).length,
    requested: body.ids.length,
    action: body.action,
  });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
