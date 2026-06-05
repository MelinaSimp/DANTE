// app/api/review/route.ts
//
// Supervisor review queue API. Lists pending items and handles
// approve/reject actions for autonomous agent outputs.
//
// GET  — list pending (+ recently reviewed) items for the workspace
// POST — approve or reject a queued item

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ReviewAction {
  item_id: string;
  action: "approve" | "reject";
  note?: string;
}

export async function GET(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

  const query = supabaseAdmin
    .from("outbound_review_queue")
    .select(
      "id, kind, payload, source_kind, source_id, contact_id, " +
      "review_status, reviewed_by, reviewed_at, review_note, " +
      "sent_at, send_error, created_at",
    )
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query.eq("review_status", status);
  }

  const { data: items, error } = await query;

  if (error) {
    console.error("[review] query failed:", error);
    return NextResponse.json({ error: "Failed to load queue" }, { status: 500 });
  }

  // Get pending count separately for badge
  const { count: pendingCount } = await supabaseAdmin
    .from("outbound_review_queue")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id)
    .eq("review_status", "pending");

  return NextResponse.json({
    items: items || [],
    pending_count: pendingCount || 0,
  });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  // Only owners and supervisors can approve/reject
  if (!["owner", "supervisor", "admin"].includes(profile.role || "")) {
    return NextResponse.json(
      { error: "Supervisor or owner access required" },
      { status: 403 },
    );
  }

  const body = (await req.json()) as ReviewAction;
  if (!body.item_id || !["approve", "reject"].includes(body.action)) {
    return NextResponse.json(
      { error: "item_id and action (approve|reject) required" },
      { status: 400 },
    );
  }

  // Verify the item belongs to this workspace and is still pending
  const { data: item } = await supabaseAdmin
    .from("outbound_review_queue")
    .select("id, review_status, kind, send_callback_route, send_callback_data")
    .eq("id", body.item_id)
    .eq("workspace_id", profile.workspace_id)
    .single();

  if (!item) {
    return NextResponse.json(
      { error: "Item not found in your workspace" },
      { status: 404 },
    );
  }

  if (item.review_status !== "pending") {
    return NextResponse.json(
      { error: `Item already ${item.review_status}` },
      { status: 409 },
    );
  }

  const newStatus = body.action === "approve" ? "approved" : "rejected";

  const { error: updateErr } = await supabaseAdmin
    .from("outbound_review_queue")
    .update({
      review_status: newStatus,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: body.note || null,
    })
    .eq("id", body.item_id);

  if (updateErr) {
    console.error("[review] update failed:", updateErr);
    return NextResponse.json(
      { error: "Failed to update review status" },
      { status: 500 },
    );
  }

  // If approved and has a send callback, trigger the send
  if (newStatus === "approved" && item.send_callback_route) {
    try {
      const callbackUrl = new URL(
        item.send_callback_route,
        process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio",
      );
      const cbRes = await fetch(callbackUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
        },
        body: JSON.stringify({
          review_item_id: body.item_id,
          ...(item.send_callback_data as object || {}),
        }),
      });

      if (cbRes.ok) {
        await supabaseAdmin
          .from("outbound_review_queue")
          .update({
            review_status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", body.item_id);
      } else {
        const errText = await cbRes.text().catch(() => "unknown error");
        await supabaseAdmin
          .from("outbound_review_queue")
          .update({
            review_status: "failed",
            send_error: errText.slice(0, 500),
          })
          .eq("id", body.item_id);
      }
    } catch (err) {
      await supabaseAdmin
        .from("outbound_review_queue")
        .update({
          review_status: "failed",
          send_error: String(err).slice(0, 500),
        })
        .eq("id", body.item_id);
    }
  }

  return NextResponse.json({
    success: true,
    item_id: body.item_id,
    status: newStatus,
  });
}
