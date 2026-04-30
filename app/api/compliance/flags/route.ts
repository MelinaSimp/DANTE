// GET /api/compliance/flags?status=pending&limit=100
//
// Workspace-scoped list of compliance_flags for the CCO dashboard.
// Status filter: pending | approved | dismissed | all.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "100", 10),
    500,
  );

  let q = supabaseAdmin
    .from("compliance_flags")
    .select(
      "id, source_type, source_id, layer, rule_id, severity, message, status, scanned_text, created_at",
    )
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flags: data || [] });
}
