// app/api/me/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export async function GET() {
  // Get the currently signed-in user from cookies/session
  const sb = await createServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });

  // Read profile with service role to avoid any RLS edge cases
  const { data: prof, error } = await supabaseAdmin
    .from("profiles")
    .select("id, is_superadmin, role, workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    authenticated: true,
    userId: user.id,
    is_superadmin: hasSuperadminAccess(user.email, prof?.is_superadmin),
    role: prof?.role ?? null,
    workspace_id: prof?.workspace_id ?? null,
  });
}
