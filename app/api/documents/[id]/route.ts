import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Get document by ID with signed URL
 * GET /api/documents/[id]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data: signedUrl } = await supabaseAdmin.storage
      .from("client-documents")
      .createSignedUrl(doc.file_path, 3600);

    return NextResponse.json({
      ...doc,
      url: signedUrl?.signedUrl ?? null,
    });
  } catch (error: any) {
    console.error("Document API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Delete document
 * DELETE /api/documents/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("file_path")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await supabaseAdmin.storage
      .from("client-documents")
      .remove([doc.file_path]);

    await supabaseAdmin.from("documents").delete().eq("id", id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Document delete error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
