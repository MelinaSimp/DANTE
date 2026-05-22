// app/api/cron/file-index-drain/route.ts
//
// Background cron — drains the file index backlog by creating
// content_requests for uningesteed files. The Electron app polls
// content_requests and extracts text locally, so this is the pump
// that keeps files flowing into the vault without waiting for Dante
// to search for them.
//
// Runs every minute via Vercel cron. Each tick creates up to 30
// content_requests across all workspaces. At steady state (Electron
// app running), this clears ~30 files/min = ~1800 files/hour.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 30;

async function handle(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;

  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find file_index entries that have never been ingested and don't
  // have a pending content_request already.
  const { data: candidates, error } = await supabaseAdmin
    .from("watched_file_index")
    .select("id, folder_id, workspace_id, file_path, ingest_status")
    .is("deleted_at", null)
    .is("vault_item_id", null)
    .in("ingest_status", ["indexed", "ingest_failed"])
    .order("last_seen_at", { ascending: false })
    .limit(BATCH_SIZE);

  if (error || !candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, created: 0, remaining: 0 });
  }

  const requests = candidates
    .filter((c) => c.folder_id)
    .map((c) => ({
      workspace_id: c.workspace_id,
      folder_id: c.folder_id,
      index_entry_id: c.id,
      file_path: c.file_path,
      requested_by: "cron:file-index-drain",
    }));

  if (requests.length === 0) {
    return NextResponse.json({ ok: true, created: 0, remaining: 0 });
  }

  await supabaseAdmin.from("content_requests").insert(requests);
  await supabaseAdmin
    .from("watched_file_index")
    .update({ ingest_status: "ingest_requested" })
    .in("id", candidates.map((c) => c.id));

  // Check how many remain
  const { count } = await supabaseAdmin
    .from("watched_file_index")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .is("vault_item_id", null)
    .in("ingest_status", ["indexed", "ingest_failed"]);

  return NextResponse.json({
    ok: true,
    created: requests.length,
    remaining: count ?? 0,
  });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
