import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Get annotations for a document
 * GET /api/documents/annotations?documentId=xxx
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

    const documentId = req.nextUrl.searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("document_annotations")
      .select("*")
      .eq("document_id", documentId)
      .order("page_number")
      .order("created_at");

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ annotations: data ?? [] });
  } catch (error: any) {
    console.error("Annotations API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Create annotation
 * POST /api/documents/annotations
 * Body: { documentId, page_number, type, content?, bounding_box }
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
    const { documentId, page_number, type, content, bounding_box } = body;

    if (!documentId || page_number == null || !type || !bounding_box) {
      return NextResponse.json(
        { error: "documentId, page_number, type, and bounding_box are required" },
        { status: 400 }
      );
    }

    if (!["highlight", "comment", "tag"].includes(type)) {
      return NextResponse.json(
        { error: "type must be highlight, comment, or tag" },
        { status: 400 }
      );
    }

    // Verify user has access to the document (via workspace)
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: doc } = await supabase
      .from("documents")
      .select("id, workspace_id")
      .eq("id", documentId)
      .maybeSingle();

    if (!doc || !profile?.workspace_id || doc.workspace_id !== profile.workspace_id) {
      return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
    }

    // Use user's Supabase client so RLS allows the same user to read annotations after reload
    const { data, error } = await supabase
      .from("document_annotations")
      .insert({
        document_id: documentId,
        page_number: Number(page_number),
        type,
        content: content ?? null,
        bounding_box,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Annotation create error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
