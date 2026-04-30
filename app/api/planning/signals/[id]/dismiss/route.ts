// POST /api/planning/signals/[id]/dismiss
//
// Body: { reason?: string }
//
// Marks a signal as dismissed. The next analyzer run won't re-surface
// it unless underlying data changes (we treat re-surface = "fresh
// finding" and clear dismissed_at on upsert in lib/planning/runners.ts).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  const workspaceId = profile.workspace_id as string;

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

  // Verify the signal belongs to this workspace
  const { data: existing } = await supabase
    .from("planning_signals")
    .select("id, contact_id, signal_type")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("planning_signals")
    .update({
      dismissed_at: new Date().toISOString(),
      dismissed_by: user.id,
      dismissed_reason: reason,
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAuditEvent({
    action: "planning.signal.dismiss",
    actorUserId: user.id,
    workspaceId,
    entityType: "planning_signal",
    entityId: id,
    metadata: {
      signal_type: (existing as any).signal_type,
      contact_id: (existing as any).contact_id,
      reason,
    },
    request: req,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
