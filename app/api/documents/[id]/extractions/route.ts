// GET /api/documents/[id]/extractions
//
// Returns the most recent extraction per doc_type for a document. The
// document-viewer sidebar uses this to decide whether to show an
// "Extract data" trigger or render the stored fields/rows.
//
// Authenticated via RLS on the parent document — if the user can't see
// the document, they can't see its extractions.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parent document read — proves workspace access via RLS.
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json(
      { error: "Document not found or access denied" },
      { status: 404 }
    );
  }

  const { data: extractions, error } = await supabase
    .from("document_extractions")
    .select(
      "id, doc_type, model, prompt_version, tax_year, fields, rows, confidence, confidence_detail, verified_by, verified_at, created_at"
    )
    .eq("document_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Keep only the newest row per doc_type — the extract route upserts
  // on (document_id, doc_type, model, prompt_version) so re-runs with
  // the same model replace in-place, but a user could in principle try
  // both a 1099-B and a 1099-DIV extraction on the same PDF. Group by
  // doc_type, newest first.
  const seen = new Set<string>();
  const latest = (extractions || []).filter((e: any) => {
    if (seen.has(e.doc_type)) return false;
    seen.add(e.doc_type);
    return true;
  });

  return NextResponse.json({ extractions: latest });
}
