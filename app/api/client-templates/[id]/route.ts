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

    // Verify user can access this template (RLS SELECT allows read if in workspace)
    const { data: existing } = await supabase
      .from("client_templates")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Template not found or access denied" }, { status: 404 });
    }

    // Use admin to update (bypass RLS - we already verified access above)
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
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Template ID required" }, { status: 400 });
    }

    // Verify user can access this template (RLS SELECT allows read if in workspace)
    const { data: existing } = await supabase
      .from("client_templates")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
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
