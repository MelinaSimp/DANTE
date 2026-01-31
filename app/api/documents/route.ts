import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Get document for a contact
 * GET /api/documents?contactId=xxx
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

    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!doc) {
      return NextResponse.json({ document: null });
    }

    // Get signed URL for private bucket
    const { data: signedUrl } = await supabaseAdmin.storage
      .from("client-documents")
      .createSignedUrl(doc.file_path, 3600); // 1 hour

    return NextResponse.json({
      document: {
        ...doc,
        url: signedUrl?.signedUrl ?? null,
      },
    });
  } catch (error: any) {
    console.error("Documents API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
