// app/api/electron/watched-folders/[id]/files/[file_id]/reject/route.ts
//
// User explicitly rejected a pending file. Marks the row
// status='rejected_user' so it doesn't keep showing up, and so the
// SEC-inquiry answer ("did Drift ever index this file?") is "no,
// the user saw it and rejected it on <date>."
//
// We do NOT delete the row — the audit trail of every file the
// watcher saw is the whole point.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; file_id: string }> },
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
  const { id: folderId, file_id: fileId } = await params;

  const body = (await req.json().catch(() => ({}))) as { reason?: string };

  const { data: file } = await supabaseAdmin
    .from("watched_folder_files")
    .select("id, status, file_path")
    .eq("id", fileId)
    .eq("workspace_id", workspaceId)
    .eq("folder_id", folderId)
    .maybeSingle();
  if (!file) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }
  const f = file as { status: string; file_path: string };
  if (f.status !== "pending_user_confirm") {
    return NextResponse.json(
      { error: `cannot reject file in status '${f.status}'` },
      { status: 409 },
    );
  }

  await supabaseAdmin
    .from("watched_folder_files")
    .update({
      status: "rejected_user",
      rejected_reason: body.reason || "user rejected",
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
    })
    .eq("id", fileId);

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: workspaceId,
    user_id: user.id,
    action: "watched_folder_file.rejected",
    resource_type: "watched_folder_file",
    resource_id: fileId,
    metadata: {
      folder_id: folderId,
      file_path: f.file_path,
      reason: body.reason || null,
    },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ status: "rejected_user" });
}
