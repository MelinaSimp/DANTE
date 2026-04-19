// POST /api/documents/[id]/extract
//
// Body: { docType: 'form_1099_b' | 'form_1099_div' | 'form_1099_r' | ... }
//
// Runs structured extraction on the document's already-stored raw
// text, validates against the schema, and upserts a
// document_extractions row. Returns the parsed fields + rows so the
// UI can render the review form immediately.
//
// Idempotent on (document_id, doc_type, model, prompt_version) — re-
// running overwrites the same extraction instead of accumulating.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractDocument } from "@/lib/documents/extract";
import type { DocType } from "@/lib/documents/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const docType: DocType = body?.docType;
  if (!docType) {
    return NextResponse.json(
      { error: "docType required" },
      { status: 400 }
    );
  }

  // Load doc — RLS enforces workspace access.
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, workspace_id, contact_id, extracted_text, file_name")
    .eq("id", documentId)
    .maybeSingle();
  if (docErr || !doc) {
    return NextResponse.json(
      { error: "Document not found or access denied" },
      { status: 404 }
    );
  }
  if (!doc.extracted_text || doc.extracted_text.length < 50) {
    return NextResponse.json(
      {
        error:
          "Document has no extracted text yet — wait for the upload-side OCR/parse to complete before extracting.",
      },
      { status: 409 }
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) {
    return NextResponse.json(
      { error: "No LLM API key configured" },
      { status: 500 }
    );
  }

  let result;
  try {
    result = await extractDocument({
      docType,
      text: doc.extracted_text,
      anthropicKey,
      openaiKey,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Extraction failed: ${e?.message || e}` },
      { status: 500 }
    );
  }
  if (!result) {
    return NextResponse.json(
      { error: "LLM returned no usable extraction" },
      { status: 502 }
    );
  }

  const { error: upsertErr } = await supabaseAdmin
    .from("document_extractions")
    .upsert(
      {
        workspace_id: doc.workspace_id,
        document_id: doc.id,
        doc_type: result.docType,
        model: result.model,
        prompt_version: result.promptVersion,
        tax_year: result.taxYear,
        fields: result.fields,
        rows: result.rows,
        confidence: result.confidence,
        confidence_detail: result.confidenceDetail,
      },
      {
        onConflict: "document_id,doc_type,model,prompt_version",
      }
    );

  if (upsertErr) {
    return NextResponse.json(
      { error: `Failed to save extraction: ${upsertErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    docType: result.docType,
    taxYear: result.taxYear,
    fields: result.fields,
    rows: result.rows,
    confidence: result.confidence,
    confidenceDetail: result.confidenceDetail,
    model: result.model,
  });
}
