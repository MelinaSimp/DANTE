// app/api/vault/[id]/page/route.ts
//
// GET /api/vault/<id>/page?n=<pageNumber>
//
// Returns the extracted text of a single page so the source viewer can
// render it and highlight the cited lines. Re-extracts in memory (no
// per-page text is persisted), which keeps the path zero-retention
// friendly. Normalized identically to the chunker so stored line
// numbers line up with what the viewer shows.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractTextWithPages, normalizePageText } from "@/lib/vault/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
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

  const { data: item } = await supabaseAdmin
    .from("vault_items")
    .select("id, workspace_id, file_url, file_type, content")
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle<{ id: string; workspace_id: string; file_url: string | null; file_type: string | null; content: string | null }>();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const n = Math.max(1, parseInt(req.nextUrl.searchParams.get("n") || "1", 10) || 1);

  let pages: string[] = [];
  let pageCount = 0;
  try {
    if (item.file_url) {
      const res = await fetch(item.file_url);
      if (!res.ok) throw new Error(`source fetch ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const mt = item.file_type || res.headers.get("content-type") || "";
      const extracted = await extractTextWithPages(buffer, mt);
      pages = extracted.pages;
      pageCount = extracted.pageCount || pages.length;
    } else if (item.content) {
      pages = [item.content];
      pageCount = 1;
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "extraction failed" },
      { status: 502 },
    );
  }

  if (pages.length === 0) {
    return NextResponse.json({ error: "No extractable text for this document." }, { status: 422 });
  }

  const idx = Math.min(n, pages.length) - 1;
  const text = normalizePageText(pages[idx] || "");
  return NextResponse.json({ page: idx + 1, pageCount: pageCount || pages.length, text });
}
