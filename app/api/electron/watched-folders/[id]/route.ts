// app/api/electron/watched-folders/[id]/route.ts
//
// PATCH (pause/resume/relabel) and DELETE for a single watched
// folder. Soft-delete sets status='deleted' so the audit trail
// (which folders ever existed?) is preserved.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function authedWorkspace(
  ): Promise<{ userId: string; workspaceId: string } | null> {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string | null } | null)
    ?.workspace_id;
  if (!workspaceId) return null;
  return { userId: user.id, workspaceId };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await authedWorkspace();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: "active" | "paused";
    folder_label?: string;
    allowed_extensions?: string[];
    default_vault_project_id?: string | null;
    default_processing_mode?: "cloud" | "local_only";
  };

  // Whitelist patchable fields — same defensive pattern as
  // clients.update. Caller can't sneak workspace_id, device_id,
  // folder_path, files_indexed_count, etc. into the patch.
  const patch: Record<string, unknown> = {};
  if (body.status === "active" || body.status === "paused") {
    patch.status = body.status;
    if (body.status === "paused") patch.paused_at = new Date().toISOString();
  }
  if (typeof body.folder_label === "string") patch.folder_label = body.folder_label;
  if (Array.isArray(body.allowed_extensions))
    patch.allowed_extensions = body.allowed_extensions;
  if (body.default_vault_project_id !== undefined)
    patch.default_vault_project_id = body.default_vault_project_id;
  if (
    body.default_processing_mode === "cloud" ||
    body.default_processing_mode === "local_only"
  ) {
    patch.default_processing_mode = body.default_processing_mode;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no patchable fields in body" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("watched_folders")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit material changes (status, processing mode, allowed
  // extensions). Re-labels and project moves are noisy; skip.
  if (
    "status" in patch ||
    "default_processing_mode" in patch ||
    "allowed_extensions" in patch
  ) {
    await supabaseAdmin.from("audit_logs").insert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      action: "watched_folder.patched",
      resource_type: "watched_folder",
      resource_id: id,
      metadata: { patch },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({ folder: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await authedWorkspace();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Soft delete — preserve the audit trail. The Electron app stops
  // watching when status='deleted'.
  const { error } = await supabaseAdmin
    .from("watched_folders")
    .update({ status: "deleted" })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    action: "watched_folder.deleted",
    resource_type: "watched_folder",
    resource_id: id,
    metadata: {},
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
