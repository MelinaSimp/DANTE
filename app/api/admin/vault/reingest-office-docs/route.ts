// POST /api/admin/vault/reingest-office-docs
//
// One-shot backfill: finds all vault items with docx/xlsx/doc/xls
// file types that have no extracted text, and re-ingests them using
// the newly-added mammoth + SheetJS extractors.
//
// Safe to run multiple times — ingestVaultItem with force:true
// re-processes but doesn't duplicate chunks (it deletes old ones
// first). Runs up to 50 items per call to stay within Vercel
// function timeout.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestVaultItem } from "@/lib/vault/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const OFFICE_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "docx",
  "doc",
  "xlsx",
  "xls",
];

const OFFICE_EXTENSIONS = [".docx", ".doc", ".xlsx", ".xls"];

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Find vault items that:
  // 1. Have an office file type but no extracted content, OR
  // 2. Have an office file extension in the title but no content
  const { data: byType } = await supabaseAdmin
    .from("vault_items")
    .select("id, title, file_type")
    .in("file_type", OFFICE_TYPES)
    .or("content.is.null,text_extracted.is.null,text_extracted.eq.false")
    .limit(50);

  // Also catch items where file_type wasn't set but title has office extension
  const extPatterns = OFFICE_EXTENSIONS
    .map((ext) => `title.ilike.%${ext}`)
    .join(",");
  const { data: byExt } = await supabaseAdmin
    .from("vault_items")
    .select("id, title, file_type")
    .or(extPatterns)
    .or("content.is.null,text_extracted.is.null,text_extracted.eq.false")
    .limit(50);

  const seen = new Set<string>();
  const candidates: Array<{ id: string; title: string; file_type: string | null }> = [];
  for (const item of [...(byType || []), ...(byExt || [])]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      candidates.push(item);
    }
  }

  const results: Array<{ id: string; title: string; status: string; chunks?: number }> = [];

  for (const item of candidates.slice(0, 50)) {
    try {
      const result = await ingestVaultItem(item.id, { force: true });
      results.push({
        id: item.id,
        title: item.title,
        status: result.skipped || "ingested",
        chunks: result.chunkCount,
      });
    } catch (err) {
      results.push({
        id: item.id,
        title: item.title,
        status: `error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }

  return NextResponse.json({
    total_candidates: candidates.length,
    processed: results.length,
    results,
  });
}
