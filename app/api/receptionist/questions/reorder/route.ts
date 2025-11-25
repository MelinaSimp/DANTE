import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
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

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updates = (await req.json()) as { id: string; sort_order: number }[];
  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  for (const entry of updates) {
    // eslint-disable-next-line no-await-in-loop
    await supabase
      .from("receptionist_questions")
      .update({ sort_order: entry.sort_order })
      .eq("id", entry.id)
      .eq("workspace_id", workspaceId);
  }

  return NextResponse.json({ success: true });
}

