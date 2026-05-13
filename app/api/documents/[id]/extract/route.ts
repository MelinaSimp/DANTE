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

  let result;
  try {
    result = await extractDocument({
      docType,
      text: doc.extracted_text,
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

  // Auto-populate contact-level planning fields from this extraction
  // when they're empty. Specifically:
  //   - date_of_birth from insurance_policy.insured_dob (if the
  //     insured is the contact) or from beneficiary_form designations
  //   - state_code from form_1040 (if a future schema captures it)
  //
  // We only fill blanks; never overwrite a value the advisor already
  // set. Best-effort — failures are logged but don't block the
  // extraction response.
  try {
    if (doc.contact_id) {
      const updates: Record<string, string> = {};
      if (
        result.docType === "insurance_policy" &&
        typeof result.fields.insured_dob === "string"
      ) {
        updates.date_of_birth = String(result.fields.insured_dob);
      }
      if (Object.keys(updates).length > 0) {
        const { data: existing } = await supabaseAdmin
          .from("contacts")
          .select("date_of_birth")
          .eq("id", doc.contact_id)
          .maybeSingle();
        const existingDob = (existing as any)?.date_of_birth;
        // Only fill when blank.
        if (!existingDob && updates.date_of_birth) {
          await supabaseAdmin
            .from("contacts")
            .update({ date_of_birth: updates.date_of_birth })
            .eq("id", doc.contact_id);
        }
      }
    }
  } catch (autofillErr) {
    console.error("[extract] auto-populate contact failed:", autofillErr);
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
