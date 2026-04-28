// app/api/review-tables/route.ts — list + create

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
    .from("review_tables")
    .select("id, title, columns, doc_ids, status, last_run_at, created_at, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("review-tables GET:", error);
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
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const columns = Array.isArray(body.columns) ? body.columns : [];
  const doc_ids = Array.isArray(body.doc_ids) ? body.doc_ids : [];

  const { data, error } = await supabase
    .from("review_tables")
    .insert({
      workspace_id: profile.workspace_id,
      created_by: user.id,
      title,
      columns,
      doc_ids,
      status: "draft",
    })
    .select()
    .single();
  if (error) {
    console.error("review-tables POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
