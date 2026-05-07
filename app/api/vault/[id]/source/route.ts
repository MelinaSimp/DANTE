// app/api/vault/[id]/source/route.ts
//
// Fetches the original file backing a vault_item for the SourceViewer.
// Two paths depending on how the item got into the vault:
//
//   • file_url set (legacy /vault upload): bytes live in Supabase
//     Storage. We stream them through this route — no signed URLs
//     leaking to the client, content-type gets normalized.
//
//   • file_url null (watched-folder ingest): bytes live on the
//     user's machine. The watched_folder_files row links back to
//     vault_item_id and carries file_path. We respond with JSON
//     containing the path; the Electron renderer reads it via
//     window.electronAPI.vault.readLocalFile (Phase 2).
//
// Auth: workspace-scoped via Supabase session cookie. Same model
// as the rest of /api/vault/*.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
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
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("vault_items")
    .select("id, workspace_id, file_url, file_type, title")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const item = row as {
    id: string;
    workspace_id: string;
    file_url: string | null;
    file_type: string | null;
    title: string;
  };

  // Cloud-stored path: stream bytes through this route. We treat
  // file_url as either a public URL or a Supabase storage path.
  if (item.file_url) {
    let res: Response;
    try {
      res = await fetch(item.file_url);
    } catch (err) {
      return NextResponse.json(
        { error: `fetch failed: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 502 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream ${res.status}` },
        { status: 502 },
      );
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          inferMimeFromExtension(item.file_type) ||
          res.headers.get("Content-Type") ||
          "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  // Watched-folder path: file lives on the user's machine.
  // Find the linked watched_folder_files row to get file_path.
  const { data: wRow } = await supabaseAdmin
    .from("watched_folder_files")
    .select("file_path, file_extension")
    .eq("vault_item_id", item.id)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const wfile = wRow as {
    file_path: string;
    file_extension: string | null;
  } | null;
  if (!wfile?.file_path) {
    return NextResponse.json(
      { error: "no_source_available", note: "no file_url and no watched-folder backing row" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    kind: "local",
    path: wfile.file_path,
    extension: wfile.file_extension || item.file_type || null,
    title: item.title,
  });
}

function inferMimeFromExtension(ext: string | null): string | null {
  if (!ext) return null;
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "pdf") return "application/pdf";
  if (e === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (e === "txt" || e === "md") return "text/plain";
  return null;
}
