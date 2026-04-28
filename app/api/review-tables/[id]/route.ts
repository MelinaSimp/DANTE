// app/api/review-tables/[id]/route.ts — get/update/delete a review table.
// GET also returns all cells so the UI renders a single snapshot.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function loadAuth() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return null;
  return { supabase, workspaceId: profile.workspace_id as string };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: table } = await ctx.supabase
    .from("review_tables")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: cells } = await ctx.supabase
    .from("review_table_cells")
    .select("doc_id, column_id, value, citation, confidence, status, error")
    .eq("table_id", id);

  // Inflate doc titles so the UI doesn't need a second round-trip.
  const docIds = (table.doc_ids as string[]) || [];
  let docs: Array<{ id: string; title: string }> = [];
  if (docIds.length > 0) {
    const { data: docRows } = await ctx.supabase
      .from("vault_items")
      .select("id, title, kind")
      .in("id", docIds)
      .eq("workspace_id", ctx.workspaceId);
    docs = docRows || [];
  }

  return NextResponse.json({ ...table, cells: cells || [], docs });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (Array.isArray(body.columns)) {
    const VALID_KINDS = ["text", "number", "date", "yes_no", "currency", "verbatim", "list"];
    updates.columns = body.columns.filter(
      (c: any) =>
        c &&
        typeof c.id === "string" &&
        typeof c.name === "string" &&
        typeof c.prompt === "string" &&
        VALID_KINDS.includes(c.kind)
    );
  }
  if (Array.isArray(body.doc_ids)) updates.doc_ids = body.doc_ids;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields" }, { status: 400 });
  }
  const { data, error } = await ctx.supabase
    .from("review_tables")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await ctx.supabase
    .from("review_tables")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
