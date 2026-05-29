// GET /api/sms/phones — list the logged-in user's verified SMS phones
//
// Returns an array sorted with the primary phone first, then by
// verified_at ascending. Used by the SMS & iMessage settings page to
// render the list of connected devices.

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

  const { data, error } = await supabaseAdmin
    .from("profile_sms_phones")
    .select("id, phone, label, is_primary, verified_at, created_at")
    .eq("profile_id", user.id)
    .order("is_primary", { ascending: false })
    .order("verified_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ phones: data ?? [] });
}
