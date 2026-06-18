// app/api/autopilot/analyses/route.ts
//
// GET /api/autopilot/analyses?status=pending|approved|dismissed
// Lists the autonomous pipeline's analyses for the caller's workspace.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const status = req.nextUrl.searchParams.get("status");

  let query = supabaseAdmin
    .from("dante_document_analyses")
    .select("id, vault_item_id, doc_type, status, title, headline, confidence, summary, created_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && ["pending", "approved", "dismissed"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ analyses: data || [] });
}
