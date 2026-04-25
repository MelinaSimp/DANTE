import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncMicrosoftCalendar } from "@/lib/integrations/microsoft-calendar/sync";

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
  if (!profile?.workspace_id) return NextResponse.json({ error: "no workspace" }, { status: 400 });

  try {
    const result = await syncMicrosoftCalendar({
      workspaceId: profile.workspace_id,
      userId: user.id,
    });
    return NextResponse.json({ ok: true, result });
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

  const { data: creds } = await supabaseAdmin
    .from("oauth_credentials")
    .select("workspace_id, user_id")
    .eq("provider", "microsoft");

  const results: Array<{ workspace_id: string; user_id: string; result: unknown }> = [];
  for (const c of (creds || []) as Array<{ workspace_id: string; user_id: string }>) {
    try {
      const result = await syncMicrosoftCalendar({
        workspaceId: c.workspace_id,
        userId: c.user_id,
      });
      results.push({ workspace_id: c.workspace_id, user_id: c.user_id, result });
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
