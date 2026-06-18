// app/api/vault/[id]/chunks/route.ts
//
// GET /api/vault/<id>/chunks
//
// Returns the indexed passages for a document with their page + line
// provenance. Powers the "Source & provenance" panel: each passage
// links to its exact page and line range in the viewer.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ChunkRow {
  chunk_index: number;
  page_number: number | null;
  line_start: number | null;
  line_end: number | null;
  char_start: number | null;
  char_end: number | null;
  content: string | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { data: chunks } = await supabaseAdmin
    .from("vault_item_chunks")
    .select("chunk_index, page_number, line_start, line_end, char_start, char_end, content")
    .eq("item_id", id)
    .eq("workspace_id", profile.workspace_id)
    .order("chunk_index")
    .limit(2000)
    .returns<ChunkRow[]>();

  const out = (chunks || []).map((c) => ({
    chunk_index: c.chunk_index,
    page_number: c.page_number,
    line_start: c.line_start,
    line_end: c.line_end,
    char_start: c.char_start,
    char_end: c.char_end,
    preview: (c.content || "").slice(0, 200),
  }));

  return NextResponse.json({ chunks: out });
}
