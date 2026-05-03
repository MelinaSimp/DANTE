// app/api/auth/whoami/route.ts
//
// Minimal "who am I" endpoint used by the smoke suite (and useful
// elsewhere). Returns the authenticated user's id + workspace +
// role, or 401. No PII beyond what the caller already has.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profile ?? null,
  });
}
