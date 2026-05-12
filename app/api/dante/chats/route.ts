// /api/dante/chats — list recent chats for the sidebar.

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
  if (!profile?.workspace_id) return NextResponse.json({ chats: [] });

  const { data, error } = await supabaseAdmin
    .from("dante_chats")
    .select("id, title, updated_at, created_at")
    .eq("workspace_id", profile.workspace_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(25);
  if (error) {
    // Migration not applied → empty list, not an error.
    if ((error as { code?: string }).code === "42P01") return NextResponse.json({ chats: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ chats: data || [] });
}
