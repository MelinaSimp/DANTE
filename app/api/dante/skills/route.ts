// /api/dante/skills — list workspace skills (latest version per name).

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
  if (!profile?.workspace_id) {
    return NextResponse.json({ skills: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("dante_skills")
    .select("id, name, version, description, config, input_schema, auto_approve, enabled, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .eq("enabled", true)
    .order("name", { ascending: true })
    .order("version", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Collapse to one row per name (the highest version).
  const seen = new Set<string>();
  const skills = (data || []).filter((row) => {
    if (seen.has(row.name)) return false;
    seen.add(row.name);
    return true;
  });

  return NextResponse.json({ skills });
}
