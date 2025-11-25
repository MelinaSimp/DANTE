import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

async function ensureWorkspace() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, workspaceId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, workspaceId: profile?.workspace_id ?? null };
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, workspaceId } = await ensureWorkspace();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = params.id;
  const updates = await req.json();

  const payload: Record<string, unknown> = {};
  if (typeof updates.prompt === "string") {
    const prompt = updates.prompt.trim();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt cannot be empty" }, { status: 400 });
    }
    payload.prompt = prompt;
  }
  if (typeof updates.expected_response === "string") {
    payload.expected_response = updates.expected_response;
  }
  if (typeof updates.sort_order === "number") {
    payload.sort_order = updates.sort_order;
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("receptionist_questions")
    .update(payload)
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("Failed to update question", error);
    return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, workspaceId } = await ensureWorkspace();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("receptionist_questions")
    .delete()
    .eq("id", params.id)
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("Failed to delete question", error);
    return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}












