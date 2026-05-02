// Backfill: ingest every vault_items row in the workspace that doesn't
// have chunks yet. Admin-only — chunks for a 400-page lease cost real
// embedding tokens, so we don't want a junior member kicking off a
// fleet-wide re-ingest by accident.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { ingestVaultItem } from "@/lib/vault/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!isWorkspaceAdmin(profile.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;

  // Pick targets: items with content but not yet ingested (or all, if forced).
  let query = supabaseAdmin
    .from("vault_items")
    .select("id, content, text_extracted")
    .eq("workspace_id", profile.workspace_id)
    .not("content", "is", null);
  if (!force) query = query.eq("text_extracted", false);

  const { data: items, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    id: string;
    chunkCount?: number;
    skipped?: string;
    error?: string;
  }> = [];

  // Sequential to keep embedding spend predictable.
  for (const item of items || []) {
    try {
      const r = await ingestVaultItem(item.id, { force });
      results.push({
        id: r.itemId,
        chunkCount: r.chunkCount,
        skipped: r.skipped,
      });
    } catch (e: any) {
      results.push({ id: item.id, error: e?.message || "failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
