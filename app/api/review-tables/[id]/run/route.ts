// app/api/review-tables/[id]/run/route.ts
//
// Kicks off the extraction. Inline (not async) for v1 — runs up to
// 60 cells per call with concurrency=5, fits comfortably under the
// 60s Vercel limit. For larger tables, click Run again to process
// the next batch.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { runReviewTable, type ReviewColumn } from "@/lib/review/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const { id } = await params;

  const { data: table } = await supabase
    .from("review_tables")
    .select("id, columns, doc_ids")
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const columns = (table.columns as ReviewColumn[]) || [];
  const docIds = (table.doc_ids as string[]) || [];
  if (columns.length === 0 || docIds.length === 0) {
    return NextResponse.json(
      { error: "Add at least one column and one document before running." },
      { status: 400 }
    );
  }

  await supabase
    .from("review_tables")
    .update({ status: "running" })
    .eq("id", id);

  const result = await runReviewTable(supabase as any, {
    tableId: id,
    workspaceId: profile.workspace_id,
    columns,
    docIds,
  });
  return NextResponse.json(result);
}
