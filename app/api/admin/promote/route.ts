import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_superadmin", true);

  if (count && count > 0) {
    return NextResponse.json({ error: "A superadmin already exists. This endpoint only works for initial setup." }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ is_superadmin: true, role: "owner" })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: `User ${user.email} promoted to superadmin` });
}
