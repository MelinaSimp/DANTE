// app/api/electron/watched-folders/route.ts
//
// REST API the Electron app calls to register / list / manage
// folders it's watching for ingest into Vault.
//
// Phase 1 — schema and protocol only. The Electron-side runtime
// that consumes this lands in Phase 2 (chokidar watcher in main
// process, file-confirmation toast in renderer).
//
// All routes are workspace-scoped via the user's session. The
// Electron app sends the user's Supabase session cookie; same
// auth model as the rest of the web app.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
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

  const { data: folders } = await supabaseAdmin
    .from("watched_folders")
    .select(
      "id, kind, device_id, device_label, folder_path, folder_label, allowed_extensions, default_vault_project_id, default_processing_mode, status, created_at, last_seen_at, files_indexed_count",
    )
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  return NextResponse.json({ folders: folders || [] });
}

export async function POST(req: Request) {
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

  const body = (await req.json().catch(() => ({}))) as {
    kind?: "local_electron" | "onedrive" | "google_drive" | "dropbox";
    device_id?: string;
    device_label?: string;
    folder_path?: string;
    folder_label?: string;
    allowed_extensions?: string[];
    default_vault_project_id?: string;
    default_processing_mode?: "cloud" | "local_only";
  };

  if (!body.folder_path) {
    return NextResponse.json(
      { error: "folder_path is required" },
      { status: 400 },
    );
  }
  const kind = body.kind || "local_electron";
  if (kind === "local_electron" && !body.device_id) {
    return NextResponse.json(
      { error: "device_id is required for kind=local_electron" },
      { status: 400 },
    );
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("watched_folders")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      kind,
      device_id: body.device_id ?? null,
      device_label: body.device_label ?? null,
      folder_path: body.folder_path,
      folder_label: body.folder_label ?? body.folder_path.split("/").pop() ?? body.folder_path,
      allowed_extensions: body.allowed_extensions ?? [
        "pdf",
        "docx",
        "xlsx",
        "txt",
        "md",
        "rtf",
      ],
      default_vault_project_id: body.default_vault_project_id ?? null,
      default_processing_mode: body.default_processing_mode ?? "cloud",
      watcher_token: `dwt_${crypto.randomBytes(32).toString("hex")}`,
      status: "active",
    })
    .select(
      "id, kind, device_id, device_label, folder_path, folder_label, allowed_extensions, default_vault_project_id, default_processing_mode, status, created_at",
    )
    .single();

  if (error) {
    // Unique-violation: folder already registered for this device
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "folder already registered on this device" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit-log the registration so the firm has a record of when
  // each folder was added to Drift's coverage. Critical for the
  // SEC-inquiry answer ("when did Drift start watching this
  // folder?").
  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: workspaceId,
    user_id: user.id,
    action: "watched_folder.registered",
    resource_type: "watched_folder",
    resource_id: (inserted as { id: string }).id,
    metadata: {
      kind,
      device_id: body.device_id ?? null,
      folder_path: body.folder_path,
    },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ folder: inserted });
}
