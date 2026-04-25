// /api/integrations/gmail/sync — manual + cron entry point.
//
// POST runs the sync for the current authenticated user (manual
// "sync now" button). GET runs for ALL users with a Google credential
// in the workspace; this is the cron-friendly path, gated by a
// CRON_SECRET header so a public hit can't kick the world.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncGmail, distillEmailsIntoMemory } from "@/lib/integrations/gmail/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 400 });
  }

  try {
    const sync = await syncGmail({ workspaceId: profile.workspace_id, userId: user.id });
    const distilled = await distillEmailsIntoMemory(profile.workspace_id);
    return NextResponse.json({ ok: true, sync, distilled });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync_failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  if (cronSecret && provided !== cronSecret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Sweep every user that has connected Google. The sync helper
  // is per-user because Gmail credentials are user-personal.
  const { data: creds } = await supabaseAdmin
    .from("oauth_credentials")
    .select("workspace_id, user_id")
    .eq("provider", "google");

  const results: Array<{ workspace_id: string; user_id: string; result: unknown }> = [];
  for (const c of (creds || []) as Array<{ workspace_id: string; user_id: string }>) {
    try {
      const sync = await syncGmail({ workspaceId: c.workspace_id, userId: c.user_id });
      const distilled = await distillEmailsIntoMemory(c.workspace_id);
      results.push({ workspace_id: c.workspace_id, user_id: c.user_id, result: { sync, distilled } });
    } catch (err) {
      results.push({
        workspace_id: c.workspace_id,
        user_id: c.user_id,
        result: { error: err instanceof Error ? err.message : "sync_failed" },
      });
    }
  }
  return NextResponse.json({ ok: true, count: results.length, results });
}
