// POST /api/custodians/seed-demo
//
// One-click "turn on demo data" for a workspace. Creates a mock
// custodian connection if none exists, then fires a full sync so
// custodian_accounts / custodian_balances / custodian_positions all
// light up immediately.
//
// Intended for development, demos, and new-workspace onboarding.
// Production real-custodian connections go through a separate OAuth
// flow (not built yet). Any UI that shows numbers sourced from this
// mock driver MUST label them "Demo data" — see DEPTH-PLAN.md failure
// modes: "Pretending the mock driver is a custodian."

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const wid = profile.workspace_id;

  // Reuse an existing mock connection if the workspace already has one;
  // otherwise create a fresh row. Either way we end up kicking a sync.
  const { data: existing } = await supabaseAdmin
    .from("custodian_connections")
    .select("id")
    .eq("workspace_id", wid)
    .eq("provider", "mock")
    .maybeSingle();

  let connectionId: string;
  if (existing?.id) {
    connectionId = existing.id as string;
  } else {
    const { data: created, error: insErr } = await supabaseAdmin
      .from("custodian_connections")
      .insert({
        workspace_id: wid,
        provider: "mock",
        label: "Demo custodian (mock)",
        credentials_vault_ref: null,
        status: "active",
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return NextResponse.json(
        { error: `Failed to create mock connection: ${insErr?.message}` },
        { status: 500 }
      );
    }
    connectionId = created.id as string;
  }

  // Delegate the heavy lifting to the same sync logic real custodians
  // will use. Internal fetch keeps the two paths identical.
  const origin = new URL(_req.url).origin;
  const syncRes = await fetch(`${origin}/api/custodians/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Forward auth cookie so the sync route authenticates as the
      // same user.
      cookie: _req.headers.get("cookie") || "",
    },
    body: JSON.stringify({ connectionId }),
  });
  const syncJson = await syncRes.json().catch(() => ({}));

  if (!syncRes.ok) {
    return NextResponse.json(
      { error: `Sync failed: ${syncJson?.error || "unknown"}`, connectionId },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, connectionId, ...syncJson });
}
