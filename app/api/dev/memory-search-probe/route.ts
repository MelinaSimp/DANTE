// app/api/dev/memory-search-probe/route.ts
//
// Internal probe used by the smoke suite to verify the
// dante_memory_search RPC isn't erroring with the type-mismatch
// regression we saw in production. Calls the RPC with a zero
// vector + an arbitrary query string, returns the count of hits
// (or the error string if the call fails).
//
// Not exposed to end users. Behind auth — anyone in any workspace
// can run it against their own data, since it's read-only and
// scoped by workspace_id RLS.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { searchMemory } from "@/lib/dante/memory/search";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { query?: string };
  const query = body.query ?? "smoke test";

  try {
    const hits = await searchMemory({
      workspaceId: profile.workspace_id,
      query,
      k: 1,
    });
    return NextResponse.json({ ok: true, hits: hits.length });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
