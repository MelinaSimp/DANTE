// app/api/knowledge/route.ts
import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
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

    // Create knowledge base entry
    const { data: entry, error } = await supabase
      .from("knowledge_base")
      .insert({
        workspace_id: profile.workspace_id,
        category: category.trim(),
        title: title.trim(),
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error("Knowledge base creation error:", error);
      return NextResponse.json({ error: "Failed to create knowledge entry" }, { status: 500 });
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Knowledge base API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
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

    // Get knowledge base entries
    const { data: entries, error } = await supabase
      .from("knowledge_base")
      .select("*")
      .eq("workspace_id", profile.workspace_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Knowledge base fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch knowledge entries" }, { status: 500 });
    }

    return NextResponse.json(entries || []);
  } catch (error) {
    console.error("Knowledge base fetch API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}