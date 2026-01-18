import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * LLM Chat History API
 * GET /api/llm/chats - List all chats
 * POST /api/llm/chats - Create new chat
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Get all LLM chats for this user
    const { data: chats, error } = await supabaseAdmin
      .from("llm_chats")
      .select("id, title, created_at, updated_at")
      .eq("workspace_id", profile.workspace_id)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching chats:", error);
      return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 });
    }

    return NextResponse.json({ chats: chats || [] });
  } catch (error: any) {
    console.error("LLM Chats API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

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

    const { title } = await req.json();

    // Create new chat
    const { data: chat, error } = await supabaseAdmin
      .from("llm_chats")
      .insert({
        workspace_id: profile.workspace_id,
        user_id: user.id,
        title: title || "New Chat",
        messages: [],
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating chat:", error);
      return NextResponse.json({ error: "Failed to create chat" }, { status: 500 });
    }

    return NextResponse.json({ chat });
  } catch (error: any) {
    console.error("LLM Chats API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



