// app/api/electron/watched-folders/[id]/files/route.ts
//
// Lists files seen by a watched folder, optionally filtered by
// status. Used by the renderer's "Pending files" surface to show
// the user what's awaiting confirmation. Most-recent first.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id: folderId } = await params;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  // Cap at 5000 — a deal room with thousands of supporting docs
  // shouldn't have to paginate. Beyond 5000 the JSON payload + React
  // render cost outweigh anything pagination would buy us; we'd want
  // a virtualized list instead. Renderer asks for 2000 by default
  // which covers 99% of fiduciary workflows.
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "2000", 10), 5000);

  let q = supabaseAdmin
    .from("watched_folder_files")
    .select(
      "id, folder_id, file_path, file_name, file_extension, file_size_bytes, content_sha256, status, rejected_reason, vault_item_id, confirmed_at, created_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ files: data || [] });
}
