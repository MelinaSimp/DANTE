// app/api/library/route.ts — list + create saved prompts.
//
// Workspace-scoped. RLS enforces isolation; this route still scopes
// queries to keep the wire tight and to 404 cleanly on stale state.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("library_prompts")
    .select("id, title, prompt, description, created_at, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("library GET:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const body = await request.json();
  const title = (body.title || "").trim();
  const prompt = (body.prompt || "").trim();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  const { data, error } = await supabase
    .from("library_prompts")
    .insert({
      workspace_id: profile.workspace_id,
      created_by: user.id,
      title,
      prompt,
      description: body.description?.trim() || null,
    })
    .select()
    .single();
  if (error) {
    console.error("library POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
