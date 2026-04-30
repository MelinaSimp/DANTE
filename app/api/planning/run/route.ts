// POST /api/planning/run
//
// Manual trigger for the planning analyzers. Body shapes:
//   {}                     → run every contact in the user's workspace
//   { contactId: "..." }   → run just that contact (used by the per-
//                            client "Refresh planning" action)
//
// Auth: standard user session. Read-only callers can't trigger this;
// any authenticated user in the workspace can.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  runPlanningForContact,
  runPlanningForWorkspace,
} from "@/lib/planning/runners";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
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
  const contactId = typeof body.contactId === "string" ? body.contactId : null;

  try {
    if (contactId) {
      const drafts = await runPlanningForContact(workspaceId, contactId);
      await logAuditEvent({
        action: "planning.run.contact",
        actorUserId: user.id,
        workspaceId,
        entityType: "contact",
        entityId: contactId,
        metadata: { signal_count: drafts.length },
        request: req,
      }).catch(() => {});
      return NextResponse.json({
        ok: true,
        contactId,
        signal_count: drafts.length,
        signals: drafts,
      });
    }

    const r = await runPlanningForWorkspace(workspaceId, "manual", user.id);
    await logAuditEvent({
      action: "planning.run.workspace",
      actorUserId: user.id,
      workspaceId,
      entityType: "workspace",
      entityId: workspaceId,
      metadata: {
        contact_count: r.contactCount,
        signal_count: r.signalCount,
        errors: r.errors,
      },
      request: req,
    }).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Run failed" },
      { status: 500 },
    );
  }
}
