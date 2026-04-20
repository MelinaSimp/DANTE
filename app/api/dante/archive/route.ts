// app/api/dante/archive/route.ts
//
// Dante Archive — list endpoint. GET returns every document the
// caller's workspace owns, newest first, with a compact shape so the
// gallery doesn't need a second round-trip.
//
// We deliberately don't return chunk content here — that can be many
// MB per document. The /[id] route pulls chunks for the detail view
// on demand.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("dante_archive_documents")
    .select("id, title, kind, tags, mime_type, byte_size, page_count, source_url, status, error, created_at, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  if (error) {
    // Pre-migration: return empty so the UI still renders.
    if ((error as { code?: string }).code === "42P01") {
      return NextResponse.json({ documents: [], migration_pending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Per-workspace chunk counts in one round-trip so the list can show
  // "42 chunks" next to each doc.
  const docIds = (data || []).map((d) => d.id);
  let chunkCounts: Record<string, number> = {};
  if (docIds.length > 0) {
    const { data: counts } = await supabaseAdmin
      .from("dante_archive_chunks")
      .select("document_id")
      .in("document_id", docIds);
    if (counts) {
      chunkCounts = counts.reduce((acc, row) => {
        acc[row.document_id] = (acc[row.document_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }
  }

  return NextResponse.json({
    documents: (data || []).map((d) => ({ ...d, chunk_count: chunkCounts[d.id] || 0 })),
  });
}
