import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PDFParse } from "pdf-parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Upload a PDF document for a contact (client)
 * POST /api/documents/upload
 * Body: FormData with file, contactId
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const contactId = formData.get("contactId") as string;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (!contactId) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    // Verify contact belongs to workspace
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("id", contactId)
      .eq("workspace_id", profile.workspace_id)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Extract text from PDF
    let extractedText = "";
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      extractedText = textResult?.text ?? "";
      await parser.destroy();
    } catch (err) {
      console.warn("PDF text extraction failed:", err);
    }

    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `${profile.workspace_id}/${contactId}/${timestamp}_${sanitizedName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("client-documents")
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Document upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload document" },
        { status: 500 }
      );
    }

    // Upsert document (one per contact - replace if exists)
    const { data: existing } = await supabaseAdmin
      .from("documents")
      .select("id, file_path")
      .eq("contact_id", contactId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.storage
        .from("client-documents")
        .remove([existing.file_path]);
    }

    const { data: doc, error: docError } = await supabaseAdmin
      .from("documents")
      .upsert(
        {
          workspace_id: profile.workspace_id,
          contact_id: contactId,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          extracted_text: extractedText,
        },
        { onConflict: "contact_id" }
      )
      .select()
      .single();

    if (docError) {
      console.error("Document insert error:", docError);
      return NextResponse.json(
        { error: "Failed to save document record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: doc.id,
      file_path: doc.file_path,
      file_name: doc.file_name,
      extracted_text: doc.extracted_text,
    });
  } catch (error: any) {
    console.error("Document upload error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
