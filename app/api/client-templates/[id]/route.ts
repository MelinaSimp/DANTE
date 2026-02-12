import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Update a template
 * PUT /api/client-templates/[id]
 * Body: { name?: string, annotatedPageNumbers?: number[] }
 */
export async function PUT(
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json(
        { error: "No workspace found. Please ensure your account has a workspace assigned." },
        { status: 400 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Template ID required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, annotatedPageNumbers } = body as {
      name?: string;
      annotatedPageNumbers?: number[];
    };

    const updates: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) {
      updates.name = name.trim();
    }
    if (Array.isArray(annotatedPageNumbers)) {
      updates.annotated_page_numbers = annotatedPageNumbers;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Fetch template with admin (no RLS) and verify workspace match
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("client_templates")
      .select("id, workspace_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("Client template fetch error:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (existing.workspace_id !== profile.workspace_id) {
      console.error("Template workspace mismatch", {
        templateWorkspace: existing.workspace_id,
        userWorkspace: profile.workspace_id,
      });
      return NextResponse.json(
        { error: "Access denied: template is in a different workspace" },
        { status: 403 }
      );
    }

    // Update with admin (we've verified workspace)
    const { data: template, error } = await supabaseAdmin
      .from("client_templates")
      .update(updates)
      .eq("id", id)
      .select("id, name, document_id, annotated_page_numbers, created_at")
      .maybeSingle();

    if (error) {
      console.error("Client template update error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!template) {
      return NextResponse.json({ error: "Update did not affect any rows" }, { status: 500 });
    }

    return NextResponse.json({ template });
  } catch (error: unknown) {
    console.error("Client template PUT error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Delete a template
 * DELETE /api/client-templates/[id]
 */
export async function DELETE(
  _req: NextRequest,
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Template ID required" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("client_templates")
      .select("id, workspace_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing || existing.workspace_id !== profile.workspace_id) {
      return NextResponse.json({ error: "Template not found or access denied" }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from("client_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Client template delete error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Client template DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
