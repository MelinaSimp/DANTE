import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * List templates for a contact
 * GET /api/client-templates?contactId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contactId = req.nextUrl.searchParams.get("contactId");
    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }

    const { data: templates, error } = await supabase
      .from("client_templates")
      .select("id, name, document_id, annotated_page_numbers, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: templates ?? [] });
  } catch (error: unknown) {
    console.error("Client templates GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Create a template from the current document + annotations
 * POST /api/client-templates
 * Body: { contactId, documentId, name, annotatedPageNumbers?: number[] }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      contactId,
      documentId,
      name,
      annotatedPageNumbers = [],
    } = body as {
      contactId: string;
      documentId: string;
      name: string;
      annotatedPageNumbers?: number[];
    };

    if (!contactId || !documentId || !name?.trim()) {
      return NextResponse.json(
        { error: "contactId, documentId, and name are required" },
        { status: 400 }
      );
    }

    // Ensure document belongs to this contact (and user has access via RLS)
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, contact_id, workspace_id")
      .eq("id", documentId)
      .eq("contact_id", contactId)
      .maybeSingle();

    if (docError || !doc) {
      return NextResponse.json(
        { error: "Document not found or access denied" },
        { status: 404 }
      );
    }

    const { data: template, error: insertError } = await supabaseAdmin
      .from("client_templates")
      .insert({
        workspace_id: doc.workspace_id,
        contact_id: contactId,
        document_id: documentId,
        name: name.trim(),
        annotated_page_numbers: Array.isArray(annotatedPageNumbers)
          ? annotatedPageNumbers
          : [],
      })
      .select("id, name, document_id, annotated_page_numbers, created_at")
      .single();

    if (insertError) {
      console.error("Client template insert error:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ template });
  } catch (error: unknown) {
    console.error("Client templates POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
