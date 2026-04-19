// One-shot maintenance endpoint: re-syncs every deployed VAPI agent in
// the caller's workspace. Useful after we ship a change to the system
// prompt (e.g. the stale-date fix) — VAPI caches the prompt per
// assistant and only refreshes when we push a new config, so existing
// assistants keep serving the old prompt until something triggers a
// sync. Hitting this endpoint once brings every assistant up to date.
//
// Usage: POST /api/agents/resync-voice
// Response: { resynced: [{ id, name, assistantId }], failed: [...] }

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncAgentToVapi } from "@/lib/vapi/sync";

export async function POST() {
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
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  if (!process.env.VAPI_API_KEY) {
    return NextResponse.json(
      { error: "VAPI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, name, vapi_assistant_id")
    .eq("workspace_id", profile.workspace_id)
    .eq("voice_provider", "vapi")
    .eq("status", "deployed");

  const resynced: { id: string; name: string; assistantId: string }[] = [];
  const failed: { id: string; name: string; error: string }[] = [];

  for (const a of agents ?? []) {
    try {
      const { assistantId } = await syncAgentToVapi(a.id);
      resynced.push({ id: a.id, name: a.name, assistantId });
    } catch (err) {
      failed.push({
        id: a.id,
        name: a.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    total: (agents ?? []).length,
    resynced,
    failed,
  });
}
