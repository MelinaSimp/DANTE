// /api/oauth/google/start — kick off the Google OAuth flow.
//
// GET /api/oauth/google/start  → 302 to Google's consent screen.
// The flow returns to /api/oauth/google/callback, which finishes the
// exchange and persists the credential.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/oauth/google";

export const dynamic = "force-dynamic";

export async function GET() {
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
    const url = buildAuthUrl(profile.workspace_id, user.id);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth misconfigured";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
