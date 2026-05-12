// Generate or revoke a watcher_token for a watched folder.
// Used by the UI when an admin wants to set up the headless daemon.
//
// POST { folder_id } → generates a new token (replaces any existing)
// DELETE { folder_id } → revokes the token

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { folder_id } = (await req.json().catch(() => ({}))) as {
    folder_id?: string;
  };
  if (!folder_id) {
    return NextResponse.json({ error: "folder_id required" }, { status: 400 });
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

  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select("id")
    .eq("id", folder_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!folder) {
    return NextResponse.json({ error: "folder not found" }, { status: 404 });
  }

  const token = `dwt_${crypto.randomBytes(32).toString("hex")}`;

  const { error } = await supabaseAdmin
    .from("watched_folders")
    .update({ watcher_token: token })
    .eq("id", folder_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    action: "watched_folder.token_generated",
    target_type: "watched_folder",
    target_id: folder_id,
    metadata: { source: "watcher_token_api" },
  });

  return NextResponse.json({ token });
}

export async function DELETE(req: Request) {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { folder_id } = (await req.json().catch(() => ({}))) as {
    folder_id?: string;
  };
  if (!folder_id) {
    return NextResponse.json({ error: "folder_id required" }, { status: 400 });
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

  const { error } = await supabaseAdmin
    .from("watched_folders")
    .update({ watcher_token: null })
    .eq("id", folder_id)
    .eq("workspace_id", workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    action: "watched_folder.token_revoked",
    target_type: "watched_folder",
    target_id: folder_id,
    metadata: { source: "watcher_token_api" },
  });

  return NextResponse.json({ ok: true });
}
