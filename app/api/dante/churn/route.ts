// app/api/dante/churn/route.ts
//
// GET → ranked list of churn scores for the caller's workspace,
// joined with contact name/email so the UI doesn't need a second
// round-trip. Highest score first (most at-risk at the top).

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Use admin client so we can join contacts without RLS juggling;
  // workspace_id filter keeps us scoped.
  const { data: rows, error } = await supabaseAdmin
    .from("dante_churn_scores")
    .select("id, contact_id, score, tier, signals, summary, computed_at")
    .eq("workspace_id", profile.workspace_id)
    .order("score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Attach contact name/email in one extra query (instead of nested
  // join, which gets awkward across two RLS surfaces).
  const contactIds = (rows ?? []).map((r) => r.contact_id);
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, name, email, phone")
    .in("id", contactIds.length ? contactIds : ["00000000-0000-0000-0000-000000000000"]);

  const byId = new Map((contacts ?? []).map((c) => [c.id, c]));

  const enriched = (rows ?? []).map((r) => ({
    ...r,
    contact: byId.get(r.contact_id) || null,
  }));

  return NextResponse.json({ scores: enriched });
}
