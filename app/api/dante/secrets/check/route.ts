// app/api/dante/secrets/check/route.ts
//
// Quick check: does the workspace have the critical `broker_email`
// secret configured? The Dante landing page uses this to show a
// first-run setup prompt when automations can't deliver email.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
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
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { data: secrets } = await supabaseAdmin
    .from("dante_secrets")
    .select("key")
    .eq("workspace_id", profile.workspace_id);

  const keys = new Set((secrets || []).map((s) => s.key));

  return NextResponse.json({
    has_broker_email: keys.has("broker_email"),
    configured_count: keys.size,
    configured_keys: [...keys],
  });
}
