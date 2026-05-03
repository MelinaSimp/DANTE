// app/api/review-queue/route.ts
//
// Supervisor review-queue API for autonomous client-facing outputs.
// Phase 1 W1.3 — pairs with lib/review-queue/stage.ts.
//
//   GET  /api/review-queue            list pending|approved|rejected|sent rows
//   POST /api/review-queue            bulk approve / reject by id list
//
// Approving a row does NOT send. It marks the row 'approved' and
// inserts the audit log; a separate worker (or the producer's own
// scheduled tick) picks up approved rows and invokes the
// send_callback_route. This separation lets us:
//   - Test approval without testing send wiring.
//   - Re-attempt failed sends without re-approving.
//   - Centralize rate limiting + send observability in one place.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ReviewBody {
  ids: string[];
  action: "approve" | "reject";
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
    | "rejected"
    | "sent"
    | "failed";
  const kind = url.searchParams.get("kind") || null;
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") || 50), 1),
    200,
  );

  let query = supabaseAdmin
    .from("outbound_review_queue")
    .select(
      "id, kind, payload, source_kind, source_id, contact_id, review_status, reviewed_by, reviewed_at, review_note, sent_at, send_error, created_at",
    )
    .eq("workspace_id", profile.workspace_id)
    .eq("review_status", status)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;
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

  const body = (await req.json().catch(() => null)) as ReviewBody | null;
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return jsonError(400, "ids required");
  }
  if (body.action !== "approve" && body.action !== "reject") {
    return jsonError(400, "action must be approve|reject");
  }
  if (body.ids.length > 200) return jsonError(400, "too_many_ids");

  const newStatus = body.action === "approve" ? "approved" : "rejected";
  const note = (body.note || "").trim().slice(0, 500) || null;
  const nowIso = new Date().toISOString();

  // Approve only acts on rows currently pending (or, for
  // re-approval after a failed send, on rows currently failed).
  // Reject can touch pending or approved rows (an advisor changes
  // their mind before the worker sends). Refuse to touch sent rows.
  const allowedSourceStatuses =
    body.action === "approve" ? ["pending", "failed"] : ["pending", "approved"];

  const { data: updated, error } = await supabaseAdmin
    .from("outbound_review_queue")
    .update({
      review_status: newStatus,
      reviewed_by: user.id,
      reviewed_at: nowIso,
      review_note: note,
      // Clear send_error on re-approval so the worker treats it as fresh.
      send_error: body.action === "approve" ? null : undefined,
    })
    .in("id", body.ids)
    .eq("workspace_id", profile.workspace_id)
    .in("review_status", allowedSourceStatuses)
    .select("id, kind");

  if (error) return jsonError(500, error.message);

  const auditRows = (updated || []).map((row: { id: string; kind: string }) => ({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    action: `outbound.${body.action}`,
    resource_type: "outbound_review_queue",
    resource_id: row.id,
    metadata: { note, kind: row.kind, reviewed_at: nowIso },
    timestamp: nowIso,
  }));
  if (auditRows.length > 0) {
    const { error: auditErr } = await supabaseAdmin
      .from("audit_logs")
      .insert(auditRows);
    if (auditErr) {
      console.error("[review-queue] audit log insert failed:", auditErr.message);
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
