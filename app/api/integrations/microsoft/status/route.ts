// /api/integrations/microsoft/status — connect-state for the
// Microsoft panel. Mirrors /api/integrations/google/status.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
  if (!profile?.workspace_id) return NextResponse.json({ connected: false });

  const { data: cred } = await supabaseAdmin
    .from("oauth_credentials")
    .select("provider_email, expires_at, scopes, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .eq("user_id", user.id)
    .eq("provider", "microsoft")
    .maybeSingle();

  if (!cred) return NextResponse.json({ connected: false });

  // Counts span both providers — we only show the user-scoped data
  // they connected, but workspace counts are useful context either way.
  const [{ count: emailCount }, { count: calCount }] = await Promise.all([
    supabaseAdmin
      .from("customer_emails")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id),
    supabaseAdmin
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id),
  ]);

  return NextResponse.json({
    connected: true,
    email: cred.provider_email,
    expires_at: cred.expires_at,
    scopes: cred.scopes,
    updated_at: cred.updated_at,
    counts: {
      emails: emailCount ?? 0,
      calendar_events: calCount ?? 0,
    },
  });
}

export async function DELETE() {
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
  if (!profile?.workspace_id) return NextResponse.json({ ok: true });

  const { error } = await supabaseAdmin
    .from("oauth_credentials")
    .delete()
    .eq("workspace_id", profile.workspace_id)
    .eq("user_id", user.id)
    .eq("provider", "microsoft");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
