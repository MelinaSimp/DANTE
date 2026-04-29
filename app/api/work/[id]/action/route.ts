// POST /api/work/[id]/action
//
// Body: { action: 'approve' | 'snooze' | 'dismiss', snooze_days?: number }
//
// Routes the action to the right per-kind handler. The work-queue
// id is composite ("<kind>:<source-uuid>"); we parse the kind and
// dispatch. Each handler is a thin wrapper around the existing
// per-feature endpoint logic so the work surface doesn't fork
// behaviour from /reminders or /compliance.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

type Action = "approve" | "snooze" | "dismiss";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const wid = profile.workspace_id;

  const { id: composite } = await params;
  const colon = composite.indexOf(":");
  if (colon < 1) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const kind = composite.slice(0, colon);
  const sourceId = composite.slice(colon + 1);

  const body = await req.json().catch(() => ({}));
  const action: Action = body.action;
  const snoozeDays =
    typeof body.snooze_days === "number" ? body.snooze_days : 3;

  if (!["approve", "snooze", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "Bad action" }, { status: 400 });
  }

  // Audit row helper — same signature for every successful path
  // below. Fired AFTER the mutation lands so failed mutations don't
  // pollute the trail.
  const logSuccess = (extra: Record<string, unknown> = {}) =>
    logAuditEvent({
      workspaceId: wid,
      actorUserId: user.id,
      actorKind: "user",
      action: `work.${action}.${kind}`,
      entityType: kind === "flag" ? "compliance_flag" : "reminder",
      entityId: sourceId,
      metadata: { kind, action, ...extra },
      request: req,
    });

  // ── Reminders (drafts + scheduled) ──────────────────────────
  if (kind === "draft" || kind === "scheduled") {
    const { data: r } = await supabaseAdmin
      .from("reminders")
      .select("id, status, to_email, send_at")
      .eq("id", sourceId)
      .eq("workspace_id", wid)
      .maybeSingle();
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "approve") {
      if (kind !== "draft") {
        return NextResponse.json(
          { error: `Cannot approve a ${r.status} reminder` },
          { status: 400 },
        );
      }
      if (!r.to_email) {
        return NextResponse.json(
          { error: "Draft missing recipient — open the reminder to fix" },
          { status: 400 },
        );
      }
      const sendAt = r.send_at || new Date(Date.now() + 3600_000).toISOString();
      const { error } = await supabaseAdmin
        .from("reminders")
        .update({ status: "scheduled", send_at: sendAt })
        .eq("id", sourceId)
        .eq("workspace_id", wid);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logSuccess({ send_at: sendAt });
      return NextResponse.json({ ok: true });
    }

    if (action === "snooze") {
      // Push the send_at forward by N days. If there's no send_at,
      // anchor on now.
      const base = r.send_at ? new Date(r.send_at) : new Date();
      const next = new Date(base.getTime() + snoozeDays * 86400_000).toISOString();
      const { error } = await supabaseAdmin
        .from("reminders")
        .update({ send_at: next })
        .eq("id", sourceId)
        .eq("workspace_id", wid);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logSuccess({ snooze_days: snoozeDays, new_send_at: next });
      return NextResponse.json({ ok: true, send_at: next });
    }

    if (action === "dismiss") {
      const { error } = await supabaseAdmin
        .from("reminders")
        .update({ status: "cancelled" })
        .eq("id", sourceId)
        .eq("workspace_id", wid);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logSuccess();
      return NextResponse.json({ ok: true });
    }
  }

  // ── Compliance flags ────────────────────────────────────────
  if (kind === "flag") {
    if (action !== "dismiss" && action !== "approve") {
      return NextResponse.json(
        { error: "Compliance flags support dismiss / approve only" },
        { status: 400 },
      );
    }
    const status = action === "approve" ? "approved" : "dismissed";
    const { error } = await supabaseAdmin
      .from("compliance_flags")
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", sourceId)
      .eq("workspace_id", wid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logSuccess({ resolution: status });
    return NextResponse.json({ ok: true });
  }

  // ── Renewals / stale — no inline mutation in v1 ─────────────
  return NextResponse.json(
    {
      error: `Action '${action}' not supported on '${kind}' yet — open the source to act.`,
    },
    { status: 400 },
  );
}
