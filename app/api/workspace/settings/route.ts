import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspace/settings
 * Returns workspace settings for the current user's workspace.
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
      return NextResponse.json({ summary_template_document_id: null });
    }

    const { data: settings } = await supabaseAdmin
      .from("workspace_settings")
      .select("summary_template_document_id")
      .eq("workspace_id", profile.workspace_id)
      .single();

    return NextResponse.json({
      summary_template_document_id: settings?.summary_template_document_id ?? null,
    });
  } catch (error: any) {
    console.error("Workspace settings GET error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workspace/settings
 * Body: { summary_template_document_id?: string | null }
 * Sets which document's annotations define the summary template (page list). Must be a document in the same workspace.
 */
export async function PATCH(req: NextRequest) {
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
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const summary_template_document_id =
      body.summary_template_document_id === undefined
        ? undefined
        : body.summary_template_document_id === null || body.summary_template_document_id === ""
          ? null
          : String(body.summary_template_document_id);

    if (summary_template_document_id !== undefined && summary_template_document_id !== null) {
      const { data: doc } = await supabaseAdmin
        .from("documents")
        .select("id, workspace_id")
        .eq("id", summary_template_document_id)
        .single();
      if (!doc || doc.workspace_id !== profile.workspace_id) {
        return NextResponse.json(
          { error: "Template document not found or not in your workspace" },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from("workspace_settings")
      .upsert(
        {
          workspace_id: profile.workspace_id,
          summary_template_document_id: summary_template_document_id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" }
      )
      .select("summary_template_document_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      summary_template_document_id: data?.summary_template_document_id ?? null,
    });
  } catch (error: any) {
    console.error("Workspace settings PATCH error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
