// app/api/dante/archive/search/route.ts
//
// Dante Archive — vector search endpoint. The gallery's search bar
// and any external integration hit this; the workflow runner goes
// directly through searchArchive() so it doesn't pay the HTTP cost.
//
// POST body:
//   { query: string, k?: number, kind?: ArchiveKind }

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { searchArchive } from "@/lib/dante/archive/search";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const query = String(body.query || "").trim();
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const hits = await searchArchive({
      workspaceId: profile.workspace_id,
      query,
      k: Number(body.k) || 8,
      kindFilter: body.kind ? String(body.kind) : undefined,
    });
    return NextResponse.json({ hits });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
