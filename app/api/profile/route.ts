import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/profile — return the current user's profile.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, first_name, last_name, notification_email, sms_phone, role, workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ profile, authEmail: user.email ?? null });
}

/**
 * PATCH /api/profile — update editable profile fields.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Whitelist editable fields
  const allowed: Record<string, unknown> = {};
  if (typeof body.notification_email === "string") {
    const v = body.notification_email.trim();
    allowed.notification_email = v || null;
  }
  if (typeof body.full_name === "string") {
    allowed.full_name = body.full_name.trim() || null;
  }
  if (typeof body.first_name === "string") {
    allowed.first_name = body.first_name.trim() || null;
  }
  if (typeof body.last_name === "string") {
    allowed.last_name = body.last_name.trim() || null;
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update(allowed)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
