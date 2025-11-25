// app/api/knowledge/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const entryId = params.id;

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await request.json();
    const { category, title, content } = body;

    // Validate required fields
    if (!category || !title || !content) {
      return NextResponse.json({ error: "Category, title, and content are required" }, { status: 400 });
    }

    // Check if entry exists and belongs to user's workspace
    const { data: existingEntry } = await supabase
      .from("knowledge_base")
      .select("id")
      .eq("id", entryId)
      .eq("workspace_id", profile.workspace_id)
      .single();

    if (!existingEntry) {
      return NextResponse.json({ error: "Knowledge entry not found" }, { status: 404 });
    }

    // Update entry
    const { data: entry, error } = await supabase
      .from("knowledge_base")
      .update({
        category: category.trim(),
        title: title.trim(),
        content: content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .eq("workspace_id", profile.workspace_id)
      .select()
      .single();

    if (error) {
      console.error("Knowledge base update error:", error);
      return NextResponse.json({ error: "Failed to update knowledge entry" }, { status: 500 });
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Knowledge base update API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const entryId = params.id;

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Verify the entry belongs to the user's workspace
    const { data: entry } = await supabase
      .from("knowledge_base")
      .select("workspace_id")
      .eq("id", entryId)
      .single();

    if (!entry || entry.workspace_id !== profile.workspace_id) {
      return NextResponse.json({ error: "Knowledge entry not found" }, { status: 404 });
    }

    // Delete the entry
    const { error } = await supabase
      .from("knowledge_base")
      .delete()
      .eq("id", entryId);

    if (error) {
      console.error("Knowledge base deletion error:", error);
      return NextResponse.json({ error: "Failed to delete knowledge entry" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Knowledge base deletion API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
