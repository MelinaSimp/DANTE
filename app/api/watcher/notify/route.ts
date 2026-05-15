// Token-authenticated file notification endpoint for the headless
// drift-watcher daemon. Same ingest logic as the Electron notify
// route, but authenticates via a folder-specific watcher_token
// instead of a Supabase user session.
//
// Auth: Bearer <watcher_token> in the Authorization header.
// The token maps directly to a watched_folders row.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestVaultItem } from "@/lib/vault/ingest";
import { resolveProjectForWatchedFile } from "@/lib/vault/auto-project";
import { sanitizeForPostgres } from "@/lib/vault/sanitize-text";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface NotifyBody {
  file_path?: string;
  file_name?: string;
  file_extension?: string;
  file_size_bytes?: number;
  content_sha256?: string;
  extracted_text?: string;
}

export async function POST(req: Request) {
  const token = extractBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { error: "Authorization: Bearer <watcher_token> required" },
      { status: 401 },
    );
  }

  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select(
      "id, workspace_id, folder_path, status, allowed_extensions, default_vault_project_id, default_processing_mode, confirm_mode, created_by, token_expires_at",
    )
    .eq("watcher_token", token)
    .maybeSingle();

  if (!folder) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  if ((folder as { token_expires_at?: string }).token_expires_at &&
      new Date((folder as { token_expires_at: string }).token_expires_at) < new Date()) {
    return NextResponse.json({ error: "token expired" }, { status: 401 });
  }

  const f = folder as {
    id: string;
    workspace_id: string;
    folder_path: string;
    status: string;
    allowed_extensions: string[];
    default_vault_project_id: string | null;
    default_processing_mode: "cloud" | "local_only";
    confirm_mode: "per_file" | "folder_consent";
    created_by: string;
  };

  if (f.status !== "active") {
    return NextResponse.json(
      { error: `folder is ${f.status}, not active` },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as NotifyBody;
  if (!body.file_path || !body.file_name) {
    return NextResponse.json(
      { error: "file_path and file_name required" },
      { status: 400 },
    );
  }

  const ext = (body.file_extension || extractExt(body.file_name)).toLowerCase();
  let status: string = "pending_user_confirm";
  let rejectedReason: string | null = null;
  let dupVaultItemId: string | null = null;

  if (!f.allowed_extensions.map((e) => e.toLowerCase()).includes(ext)) {
    status = "rejected_extension";
    rejectedReason = `extension '${ext}' not in allowed list`;
  } else if (body.file_size_bytes && body.file_size_bytes > 100 * 1024 * 1024) {
    status = "rejected_size";
    rejectedReason = `file size ${body.file_size_bytes} exceeds 100MB cap`;
  } else if (body.content_sha256) {
    const { data: existing } = await supabaseAdmin
      .from("watched_folder_files")
      .select("vault_item_id")
      .eq("workspace_id", f.workspace_id)
      .eq("content_sha256", body.content_sha256)
      .not("vault_item_id", "is", null)
      .maybeSingle();
    const exV = (existing as { vault_item_id?: string | null } | null)
      ?.vault_item_id;
    if (exV) {
      status = "rejected_duplicate";
      rejectedReason = `content hash already ingested as vault item ${exV}`;
      dupVaultItemId = exV;
    }
  }

  // Respect the folder's confirm_mode:
  //   folder_consent → auto-confirm into vault (daemon is the consent gate)
  //   per_file       → land in pending queue for human review in the app
  const isFolderConsent = f.confirm_mode === "folder_consent";
  const hasText =
    typeof body.extracted_text === "string" &&
    body.extracted_text.trim().length > 0;
  const acceptedText =
    status === "pending_user_confirm" && isFolderConsent && hasText
      ? sanitizeForPostgres(body.extracted_text!.trim())
      : null;
  const shouldAutoConfirm =
    status === "pending_user_confirm" && isFolderConsent;

  let autoConfirmedVaultId: string | null = null;
  let autoConfirmedChunks = 0;
  let autoConfirmError: string | null = null;
  let autoProjectId: string | null = null;
  let autoProjectName: string | null = null;

  if (shouldAutoConfirm) {
    try {
      const auto = await resolveProjectForWatchedFile({
        workspaceId: f.workspace_id,
        watchedFolderPath: f.folder_path,
        filePath: body.file_path,
        userId: f.created_by,
      });
      autoProjectId = auto.projectId;
      autoProjectName = auto.projectName;
    } catch (err) {
      console.warn(
        "[watcher/notify] subfolder auto-project resolution failed:",
        err instanceof Error ? err.message : err,
      );
    }

    try {
      const { data: vaultItem, error: vaultErr } = await supabaseAdmin
        .from("vault_items")
        .insert({
          workspace_id: f.workspace_id,
          uploaded_by: f.created_by,
          kind: "document",
          title: body.file_name,
          description: `Auto-ingested by drift-watcher daemon: ${body.file_path}`,
          file_url: null,
          file_size: body.file_size_bytes ?? null,
          file_type: ext,
          content: acceptedText,
          project_id: autoProjectId ?? f.default_vault_project_id ?? null,
          processing_mode_override: null,
        })
        .select("id")
        .single();

      if (vaultErr) {
        autoConfirmError = vaultErr.message;
      } else {
        autoConfirmedVaultId = (vaultItem as { id: string }).id;
        try {
          const result = await ingestVaultItem(autoConfirmedVaultId, {
            force: true,
          });
          autoConfirmedChunks = result.chunkCount;
        } catch (err) {
          autoConfirmError =
            err instanceof Error ? err.message : "ingest_failed";
          console.warn(
            `[watcher/notify] ingestVaultItem failed for ${autoConfirmedVaultId}:`,
            autoConfirmError,
          );
        }
        status = "auto_confirmed";
      }
    } catch (err) {
      autoConfirmError =
        err instanceof Error ? err.message : "auto_confirm_failed";
      console.error("[watcher/notify] auto-confirm crashed:", err);
    }
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("watched_folder_files")
    .insert({
      folder_id: f.id,
      workspace_id: f.workspace_id,
      file_path: body.file_path,
      file_name: body.file_name,
      file_extension: ext,
      file_size_bytes: body.file_size_bytes ?? null,
      content_sha256: body.content_sha256 ?? null,
      status,
      rejected_reason: rejectedReason || autoConfirmError,
      vault_item_id: autoConfirmedVaultId || dupVaultItemId,
      confirmed_at: autoConfirmedVaultId ? new Date().toISOString() : null,
      confirmed_by: autoConfirmedVaultId ? f.created_by : null,
    })
    .select("id, status, rejected_reason, vault_item_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (autoConfirmedVaultId) {
    await supabaseAdmin
      .rpc("increment_watched_folder_count", { p_folder_id: f.id })
      .then(
        () => undefined,
        () => undefined,
      );
    await supabaseAdmin.from("audit_logs").insert({
      workspace_id: f.workspace_id,
      actor_id: f.created_by,
      action: "watched_folder_file.daemon_auto_confirmed",
      target_type: "vault_item",
      target_id: autoConfirmedVaultId,
      metadata: {
        folder_id: f.id,
        file_path: body.file_path,
        chunk_count: autoConfirmedChunks,
        ingest_error: autoConfirmError,
        auto_project_id: autoProjectId,
        auto_project_name: autoProjectName,
        source: "drift-watcher-daemon",
      },
    });
  }

  return NextResponse.json({
    file: inserted,
    next_action:
      status === "auto_confirmed"
        ? "auto_confirmed"
        : status === "pending_user_confirm"
          ? "user_confirmation_required"
          : "rejected",
    vault_item_id: autoConfirmedVaultId,
    chunk_count: autoConfirmedChunks,
  });
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

function extractExt(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1] : "";
}
