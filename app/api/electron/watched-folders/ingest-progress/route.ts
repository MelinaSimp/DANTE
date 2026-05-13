// app/api/electron/watched-folders/ingest-progress/route.ts
//
// GET endpoint the Electron renderer polls to show ingestion progress.
// Queries vault_ingest_queue grouped by status for the user's workspace,
// plus a list of recently completed items (last 5 minutes) with titles
// and chunk counts so the renderer can show real-time feedback.
//
// Uses supabaseAdmin because RLS on the queue table may not cover all
// auth paths (the table's RLS policy requires profiles join).

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  // ── Auth ──────────────────────────────────────────────────────────
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await sb
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string | null } | null)
    ?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  // ── Status counts ─────────────────────────────────────────────────
  // Supabase JS doesn't support GROUP BY natively, so we fire parallel
  // count queries — each hits the (workspace_id, status) index.
  const statuses = [
    "pending",
    "running",
    "completed",
    "failed",
    "dead",
  ] as const;

  const countResults = await Promise.all(
    statuses.map((s) =>
      supabaseAdmin
        .from("vault_ingest_queue")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", s)
        .then(({ count }) => [s, count ?? 0] as const),
    ),
  );

  const counts: Record<string, number> = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    dead: 0,
  };
  let total = 0;
  for (const [s, c] of countResults) {
    counts[s] = c;
    total += c;
  }

  // ── Recent completions (last 5 minutes) ───────────────────────────
  // Join vault_ingest_queue → vault_items to get the document title.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: recentRows } = await supabaseAdmin
    .from("vault_ingest_queue")
    .select(
      "vault_item_id, chunk_count, completed_at, vault_items(title)",
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .gte("completed_at", fiveMinAgo)
    .order("completed_at", { ascending: false })
    .limit(10);

  const recent = (recentRows ?? []).map(
    (row: Record<string, unknown>) => {
      const vi = row.vault_items as { title?: string } | null;
      return {
        vault_item_id: row.vault_item_id as string,
        title: vi?.title ?? "Untitled",
        chunk_count: (row.chunk_count as number) ?? 0,
        completed_at: row.completed_at as string,
      };
    },
  );

  return NextResponse.json({
    pending: counts.pending,
    running: counts.running,
    completed: counts.completed,
    failed: counts.failed,
    dead: counts.dead,
    total,
    recent,
  });
}
