// app/api/electron/watched-folders/[id]/notify/route.ts
//
// The Electron app calls this when its filesystem watcher detects
// a new file in a registered folder. Server validates against the
// folder's allowed_extensions, dedups by sha256, and decides:
//
//   • Cloud folder + extracted_text in body → AUTO-CONFIRM.
//     Create the vault_items row, run the chunker + embedder,
//     mark watched_folder_files as 'auto_confirmed'. Skip the
//     pending queue entirely. This is the path that fires when
//     the renderer extracted text successfully (which it does
//     for every new event on a cloud folder).
//
//   • Local-only folder OR no extracted_text → PENDING. Same as
//     before: status='pending_user_confirm', show in the
//     renderer's queue, require an explicit /confirm POST.
//     Local-only stays pending because the privacy contract
//     wants explicit per-file approval.
//
//   • Disallowed extension / oversize / sha256 duplicate → record
//     a rejected_* row for the audit trail and respond.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestVaultItem } from "@/lib/vault/ingest";
import { resolveProjectForWatchedFile } from "@/lib/vault/auto-project";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
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

  const body = (await req.json().catch(() => ({}))) as {
    file_path?: string;
    file_name?: string;
    file_extension?: string;
    file_size_bytes?: number;
    content_sha256?: string;
    extracted_text?: string;
  };

  if (!body.file_path || !body.file_name) {
    return NextResponse.json(
      { error: "file_path and file_name required" },
      { status: 400 },
    );
  }

  // Validate folder belongs to workspace + is active.
  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select(
      "id, folder_path, status, allowed_extensions, default_vault_project_id, default_processing_mode",
    )
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!folder) {
    return NextResponse.json({ error: "folder not found" }, { status: 404 });
  }
  const f = folder as {
    status: string;
    folder_path: string;
    allowed_extensions: string[];
    default_vault_project_id: string | null;
    default_processing_mode: "cloud" | "local_only";
  };
  if (f.status !== "active") {
    return NextResponse.json(
      { error: `folder is ${f.status}, not active` },
      { status: 409 },
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
    // Dedup: have we already ingested a file with this hash in this
    // workspace? If so, status=rejected_duplicate; the existing
    // vault_item_id is reported back so the user/renderer can link.
    const { data: existing } = await supabaseAdmin
      .from("watched_folder_files")
      .select("vault_item_id")
      .eq("workspace_id", workspaceId)
      .eq("content_sha256", body.content_sha256)
      .not("vault_item_id", "is", null)
      .maybeSingle();
    const exV = (existing as { vault_item_id?: string | null } | null)?.vault_item_id;
    if (exV) {
      status = "rejected_duplicate";
      rejectedReason = `content hash already ingested as vault item ${exV}`;
      dupVaultItemId = exV;
    }
  }

  // Auto-confirm path: file passed all checks, folder is cloud,
  // renderer sent extracted text. Create the vault_item +
  // chunks immediately and skip the pending state. Local-only
  // folders deliberately stay on the pending path because the
  // privacy contract wants explicit per-file approval.
  const isLocalOnly = f.default_processing_mode === "local_only";
  const acceptedText =
    !isLocalOnly &&
    status === "pending_user_confirm" &&
    typeof body.extracted_text === "string" &&
    body.extracted_text.trim().length > 0
      ? body.extracted_text.trim()
      : null;

  let autoConfirmedVaultId: string | null = null;
  let autoConfirmedChunks = 0;
  let autoConfirmError: string | null = null;
  let autoProjectId: string | null = null;
  let autoProjectName: string | null = null;
  if (acceptedText) {
    // Folder-wise routing: each top-level subfolder becomes a Vault
    // project so a deal-room ingest stays organized instead of
    // dumping every PDF into Loose Files. Files at the watch root
    // resolve to null and stay loose. Falls through to the folder's
    // configured default_vault_project_id when subfolder routing
    // returns null.
    try {
      const auto = await resolveProjectForWatchedFile({
        workspaceId,
        watchedFolderPath: f.folder_path,
        filePath: body.file_path,
        userId: user.id,
      });
      autoProjectId = auto.projectId;
      autoProjectName = auto.projectName;
    } catch (err) {
      console.warn(
        "[notify] subfolder auto-project resolution failed:",
        err instanceof Error ? err.message : err,
      );
    }

    try {
      const { data: vaultItem, error: vaultErr } = await supabaseAdmin
        .from("vault_items")
        .insert({
          workspace_id: workspaceId,
          uploaded_by: user.id,
          // vault_items.kind is constrained to 'template' | 'document'.
          kind: "document",
          title: body.file_name,
          description: `Auto-ingested from watched folder: ${body.file_path}`,
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
            `[watched-folder notify] ingestVaultItem failed for ${autoConfirmedVaultId}:`,
            autoConfirmError,
          );
        }
        // Promote the row status: even if ingest threw, the vault
        // item exists and a follow-up reingest can recover it.
        status = "auto_confirmed";
      }
    } catch (err) {
      autoConfirmError = err instanceof Error ? err.message : "auto_confirm_failed";
      console.error("[watched-folder notify] auto-confirm crashed:", err);
    }
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("watched_folder_files")
    .insert({
      folder_id: folderId,
      workspace_id: workspaceId,
      file_path: body.file_path,
      file_name: body.file_name,
      file_extension: ext,
      file_size_bytes: body.file_size_bytes ?? null,
      content_sha256: body.content_sha256 ?? null,
      status,
      rejected_reason: rejectedReason || autoConfirmError,
      vault_item_id: autoConfirmedVaultId || dupVaultItemId,
      confirmed_at: autoConfirmedVaultId ? new Date().toISOString() : null,
      confirmed_by: autoConfirmedVaultId ? user.id : null,
    })
    .select("id, status, rejected_reason, vault_item_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bump folder counter when we just auto-ingested.
  if (autoConfirmedVaultId) {
    await supabaseAdmin
      .rpc("increment_watched_folder_count", { p_folder_id: folderId })
      .then(
        () => undefined,
        () => undefined,
      );
    await supabaseAdmin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      action: "watched_folder_file.auto_confirmed",
      target_type: "vault_item",
      target_id: autoConfirmedVaultId,
      metadata: {
        folder_id: folderId,
        file_path: body.file_path,
        chunk_count: autoConfirmedChunks,
        ingest_error: autoConfirmError,
        auto_project_id: autoProjectId,
        auto_project_name: autoProjectName,
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
    default_processing_mode: f.default_processing_mode,
    default_vault_project_id: f.default_vault_project_id,
  });
}

function extractExt(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1] : "";
}
