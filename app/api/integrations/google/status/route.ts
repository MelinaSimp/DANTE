import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) return NextResponse.json({ connected: false });

  const { data: creds } = await supabaseAdmin
    .from("integration_credentials")
    .select("encrypted_oauth_token, config")
    .eq("workspace_id", profile.workspace_id)
    .eq("provider", "google")
    .maybeSingle();

  return NextResponse.json({
    connected: !!(creds?.encrypted_oauth_token),
    hasWebhook: !!(creds?.config?.webhook_channel_id),
  });
}
