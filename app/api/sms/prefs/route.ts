// GET  /api/sms/prefs   — current user's SMS profile + prefs
// PATCH /api/sms/prefs   — update briefing toggle + quiet hours + timezone
//
// The /verify routes handle phone changes; this route doesn't accept
// sms_phone or sms_verified_at to avoid bypassing verification.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(
      "sms_phone, sms_verified_at, sms_briefing_enabled, sms_quiet_start, sms_quiet_end, sms_timezone",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: data || null });
}

const WRITABLE = [
  "sms_briefing_enabled",
  "sms_quiet_start",
  "sms_quiet_end",
  "sms_timezone",
] as const;

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const k of WRITABLE) {
    if (k in body) updates[k] = (body as any)[k];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No writable fields" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select(
      "sms_phone, sms_verified_at, sms_briefing_enabled, sms_quiet_start, sms_quiet_end, sms_timezone",
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: data });
}

// DELETE removes the phone connection entirely
export async function DELETE() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabaseAdmin
    .from("profiles")
    .update({
      sms_phone: null,
      sms_verified_at: null,
      sms_briefing_enabled: false,
    })
    .eq("id", user.id);
  return NextResponse.json({ ok: true });
}
