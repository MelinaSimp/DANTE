import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

async function getWorkspaceId() {
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

export async function GET() {
  const { supabase, workspaceId } = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("receptionist_questions")
    .select("id, prompt, expected_response, sort_order, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch questions", error);
    return NextResponse.json({ error: "Failed to load questions" }, { status: 500 });
  }

  return NextResponse.json({ questions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase, workspaceId } = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const prompt = (body.prompt ?? "").toString().trim();
  const expected = (body.expected_response ?? "open").toString();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("receptionist_questions")
    .select("sort_order")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = existing ? existing.sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("receptionist_questions")
    .insert({
      workspace_id: workspaceId,
      prompt,
      expected_response: expected,
      sort_order: sortOrder,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to create question", error);
    return NextResponse.json({ error: "Failed to create question" }, { status: 500 });
  }

  return NextResponse.json({ question: data });
}












