// app/api/autopilot/analyses/bulk/route.ts
//
// POST { status: "approved" | "dismissed", ids?: string[], doc_type?: string }
//
// Bulk review-state changes for the Autopilot queue. Either an explicit
// id list or "every pending item of this doc_type" (the filter-chip
// bulk actions). Workspace-scoped; only pending items are touched so a
// bulk action can't resurrect dismissed history.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = profile?.workspace_id;
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (!["approved", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "status must be approved or dismissed" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? (body.ids as string[]).slice(0, 500) : null;
  const docType = typeof body.doc_type === "string" ? body.doc_type : null;
  if (!ids && !docType) {
    return NextResponse.json({ error: "Provide ids or doc_type" }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("dante_document_analyses")
    .update({ status })
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");
  if (ids) query = query.in("id", ids);
  if (docType) query = query.eq("doc_type", docType);

  const { data, error } = await query.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: (data || []).length });
}
