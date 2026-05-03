// app/api/public/v1/memory/search/route.ts
//
// Phase 7 W7.1 — public memory search endpoint.
//
//   POST /api/public/v1/memory/search
//   Authorization: Bearer drift_pat_<...>
//   Required scope: read:memory
//   body: { query: string, contact_id?: string, k?: number }
//
// Returns memory hits in the same shape the agent loop sees,
// minus internal embedding bytes. Useful for external systems
// that want to read the workspace's accumulated knowledge.

import { NextRequest, NextResponse } from "next/server";
import { searchMemory } from "@/lib/dante/memory/search";
import { requireApiToken } from "@/lib/auth/api-token";

export const dynamic = "force-dynamic";

interface Body {
  query?: string;
  contact_id?: string;
  k?: number;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiToken(req, "read:memory");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Body;
  const query = (body.query || "").trim();
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  try {
    const hits = await searchMemory({
      workspaceId: auth.workspaceId,
      query,
      contactId: body.contact_id,
      k: body.k,
    });
    // Strip the internals public consumers shouldn't depend on.
    const items = hits.map((h) => ({
      id: h.id,
      kind: h.kind,
      content: h.content,
      subject_contact_id: h.subject_contact_id,
      source_kind: h.source_kind,
      created_at: h.created_at,
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "search_failed" },
      { status: 500 },
    );
  }
}
