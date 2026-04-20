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
import { resolveArchiveAccess } from "@/lib/dante/archive/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const access = await resolveArchiveAccess(supabase);
  if (access.reason === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (access.reason === "no_workspace") return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Only the workspace owner can search the archive." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const query = String(body.query || "").trim();
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const hits = await searchArchive({
      workspaceId: access.workspaceId!,
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
