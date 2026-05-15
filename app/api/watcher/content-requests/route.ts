import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  }

  const { data: folders } = await supabaseAdmin
    .from("watched_folders")
    .select("id, token_expires_at")
    .eq("watcher_token", token)
    .eq("status", "active");

  if (!folders || folders.length === 0) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const expired = folders.every(
    (f) => f.token_expires_at && new Date(f.token_expires_at) < new Date(),
  );
  if (expired) {
    return NextResponse.json({ error: "token expired" }, { status: 401 });
  }

  const folderIds = folders.map((f) => f.id);

  const { data: requests } = await supabaseAdmin
    .from("content_requests")
    .select("id, file_path, index_entry_id, folder_id")
    .in("folder_id", folderIds)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("requested_at", { ascending: true })
    .limit(10);

  return NextResponse.json({ requests: requests || [] });
}
