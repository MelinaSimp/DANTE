// GET /api/integrations
//
// Returns the registry merged with this workspace's connections, so
// /settings/integrations renders connect buttons for unconnected
// providers and "Sync now / Disconnect" for connected ones.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PROVIDERS } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

export async function GET() {
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

  const { data: connections } = await supabaseAdmin
    .from("integration_connections")
    .select(
      "id, provider, status, external_account_name, last_sync_at, last_sync_status, last_sync_error, connected_at"
    )
    .eq("workspace_id", profile.workspace_id);

  const byProvider = new Map<string, any>();
  for (const c of connections || []) {
    byProvider.set((c as any).provider, c);
  }

  const merged = PROVIDERS.map((p) => ({
    ...p,
    connection: byProvider.get(p.id) || null,
  }));

  return NextResponse.json({ providers: merged });
}
