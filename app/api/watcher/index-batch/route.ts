import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface IndexEntry {
  file_path: string;
  file_name: string;
  file_extension?: string;
  file_size_bytes?: number;
  content_sha256?: string;
  file_modified_at?: string;
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  }

  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select("id, workspace_id, status, token_expires_at")
    .eq("watcher_token", token)
    .maybeSingle();

  if (!folder) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  if (folder.token_expires_at && new Date(folder.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "token expired" }, { status: 401 });
  }
  if (folder.status !== "active") {
    return NextResponse.json({ error: `folder is ${folder.status}` }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const files: IndexEntry[] = body?.files;
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "files array required" }, { status: 400 });
  }
  if (files.length > 500) {
    return NextResponse.json({ error: "max 500 files per batch" }, { status: 400 });
  }

  const rows = files
    .filter((f) => f.file_path && f.file_name)
    .map((f) => ({
      folder_id: folder.id,
      workspace_id: folder.workspace_id,
      file_path: f.file_path,
      file_name: f.file_name,
      file_extension: f.file_extension || null,
      file_size_bytes: f.file_size_bytes || null,
      content_sha256: f.content_sha256 || null,
      file_modified_at: f.file_modified_at || null,
      last_seen_at: new Date().toISOString(),
    }));

  const { error, count } = await supabaseAdmin
    .from("watched_file_index")
    .upsert(rows, { onConflict: "folder_id,file_path", ignoreDuplicates: false })
    .select("id");

  if (error) {
    console.error("[index-batch] upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("watched_folders")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", folder.id);

  return NextResponse.json({ indexed: count ?? rows.length });
}
