// /api/dante/skills/[id] — disable (DELETE) a skill row.
//
// We don't hard-delete — that would orphan run logs that point at
// the skill. Setting enabled=false retires it from retrieval while
// preserving audit history.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("dante_skills")
    .update({ enabled: false })
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
