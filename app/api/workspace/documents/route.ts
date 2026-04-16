import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspace/documents
 * Returns all documents in the current user's workspace (for e.g. template dropdown).
 * Each document includes id, file_name, and the contact's name for display.
 */
export async function GET() {
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
      .single();

    if (!profile?.workspace_id) {
      return NextResponse.json({ documents: [] });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("documents")
      .select("id, file_name, contact_id, contacts(name)")
      .eq("workspace_id", profile.workspace_id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const documents = (rows ?? []).map((d: any) => {
      const contact = Array.isArray(d.contacts) ? d.contacts[0] : d.contacts;
      return {
        id: d.id,
        file_name: d.file_name,
        contact_id: d.contact_id,
        contact_name: contact?.name ?? "Unknown",
      };
    });

    return NextResponse.json({ documents });
  } catch (error: any) {
    console.error("Workspace documents GET error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
