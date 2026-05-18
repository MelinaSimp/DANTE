// app/api/electron/watched-folders/[id]/notify-batch/route.ts
//
// Batch variant of /notify. The renderer buffers file events and
// flushes them here in groups of up to 100. Each file in the batch
// goes through the same validation pipeline as single-file /notify
// (extension, size, sha256 dedup, auto-confirm logic), but inserts
// are batched and ingestion is queued via vault_ingest_queue instead
// of inline ingestVaultItem(). This lets the endpoint return quickly
// even for 100-file batches — actual chunking + embedding happens
// asynchronously in the ingest worker.
//
// During a 1000-file rescan the renderer chunks into 100-file pages
// and calls this endpoint sequentially.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enqueueIngest, kickIngestWorker } from "@/lib/vault/ingest-queue";
import { resolveProjectForWatchedFile, projectNameForWatchedFolder } from "@/lib/vault/auto-project";
import { sanitizeForPostgres } from "@/lib/vault/sanitize-text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 100;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

type FilePayload = {
  file_path: string;
  file_name: string;
  file_extension?: string;
  file_size_bytes?: number;
  content_sha256?: string;
  extracted_text?: string;
};

type FileResult = {
  file_name: string;
  status: string;
  vault_item_id?: string;
  error?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ──────────────────────────────────────────────────────────
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

  // ── Parse body ────────────────────────────────────────────────────
  const body = (await req.json().catch(() => ({}))) as {
    files?: FilePayload[];
  };
  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json(
      { error: "files array required (max 100)" },
      { status: 400 },
    );
  }
  if (files.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `batch limited to ${MAX_BATCH} files, got ${files.length}` },
      { status: 400 },
    );
  }

  // ── Validate folder (once) ────────────────────────────────────────
  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select(
      "id, folder_path, status, allowed_extensions, default_vault_project_id, default_processing_mode, confirm_mode",
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
    confirm_mode: "per_file" | "folder_consent";
  };
  if (f.status !== "active") {
    return NextResponse.json(
      { error: `folder is ${f.status}, not active` },
      { status: 409 },
    );
  }

  const allowedSet = new Set(f.allowed_extensions.map((e) => e.toLowerCase()));
  const isLocalOnly = f.default_processing_mode === "local_only";
  const isFolderConsent = f.confirm_mode === "folder_consent";

  // ── Batch sha256 dedup lookup ─────────────────────────────────────
  // One round trip instead of N serial queries.
  const sha256Values = files
    .map((fl) => fl.content_sha256)
    .filter((h): h is string => typeof h === "string" && h.length > 0);

  const hashToVaultId = new Map<string, string>();
  if (sha256Values.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("watched_folder_files")
      .select("content_sha256, vault_item_id")
      .eq("workspace_id", workspaceId)
      .in("content_sha256", sha256Values)
      .not("vault_item_id", "is", null);
    for (const row of (existing ?? []) as Array<{
      content_sha256: string;
      vault_item_id: string;
    }>) {
      hashToVaultId.set(row.content_sha256, row.vault_item_id);
    }
  }

  // ── Per-file project resolution (cached by subfolder) ────────────
  // Files in different subfolders get different projects. We cache by
  // derived project name so we hit the DB only once per unique subfolder.
  const projectCache = new Map<string, string | null>();

  // ── Per-file validation + prepare batch inserts ───────────────────
  const results: FileResult[] = [];
  const vaultItemInserts: Array<Record<string, unknown>> = [];
  const watchedFileInserts: Array<Record<string, unknown>> = [];
  // Maps: vaultItemInserts index → results index, so we can backfill
  // vault_item_id after the batch insert returns ordered ids.
  const autoConfirmResultIndices: number[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!file.file_path || !file.file_name) {
      results.push({
        file_name: file.file_name || `file_${i}`,
        status: "error",
        error: "file_path and file_name required",
      });
      continue;
    }

    const ext = (
      file.file_extension || extractExt(file.file_name)
    ).toLowerCase();
    let status: string = "pending_user_confirm";
    let rejectedReason: string | null = null;
    let dupVaultItemId: string | null = null;

    if (!allowedSet.has(ext)) {
      status = "rejected_extension";
      rejectedReason = `extension '${ext}' not in allowed list`;
    } else if (file.file_size_bytes && file.file_size_bytes > MAX_FILE_SIZE) {
      status = "rejected_size";
      rejectedReason = `file size ${file.file_size_bytes} exceeds 100MB cap`;
    } else if (file.content_sha256 && hashToVaultId.has(file.content_sha256)) {
      status = "rejected_duplicate";
      dupVaultItemId = hashToVaultId.get(file.content_sha256)!;
      rejectedReason = `content hash already ingested as vault item ${dupVaultItemId}`;
    }

    const hasText =
      typeof file.extracted_text === "string" &&
      file.extracted_text.trim().length > 0;
    const shouldAutoConfirm =
      status === "pending_user_confirm" &&
      (isFolderConsent || (!isLocalOnly && hasText));

    if (shouldAutoConfirm) {
      const sanitizedText = hasText
        ? sanitizeForPostgres(file.extracted_text!.trim())
        : null;

      // Resolve project per-file (cached by subfolder name)
      let fileProjectId: string | null = null;
      const projName = projectNameForWatchedFolder(f.folder_path, file.file_path);
      if (projName && projectCache.has(projName)) {
        fileProjectId = projectCache.get(projName)!;
      } else if (projName) {
        try {
          const auto = await resolveProjectForWatchedFile({
            workspaceId,
            watchedFolderPath: f.folder_path,
            filePath: file.file_path,
            userId: user.id,
          });
          fileProjectId = auto.projectId;
          projectCache.set(projName, fileProjectId);
        } catch (err) {
          console.warn(
            "[notify-batch] auto-project resolution failed for",
            projName, ":",
            err instanceof Error ? err.message : err,
          );
          projectCache.set(projName, null);
        }
      }

      vaultItemInserts.push({
        workspace_id: workspaceId,
        uploaded_by: user.id,
        kind: "document",
        title: file.file_name,
        description: `Auto-ingested from watched folder: ${file.file_path}`,
        file_url: null,
        file_size: file.file_size_bytes ?? null,
        file_type: ext,
        content: sanitizedText,
        project_id: fileProjectId ?? f.default_vault_project_id ?? null,
        processing_mode_override: null,
      });
      autoConfirmResultIndices.push(results.length);
      results.push({
        file_name: file.file_name,
        status: "auto_confirmed",
        // vault_item_id backfilled below
      });
    } else {
      results.push({
        file_name: file.file_name,
        status,
        vault_item_id: dupVaultItemId ?? undefined,
        error: rejectedReason ?? undefined,
      });
    }

    // Queue the watched_folder_files row. Auto-confirmed rows get
    // their vault_item_id backfilled after the batch insert.
    watchedFileInserts.push({
      folder_id: folderId,
      workspace_id: workspaceId,
      file_path: file.file_path,
      file_name: file.file_name,
      file_extension: ext,
      file_size_bytes: file.file_size_bytes ?? null,
      content_sha256: file.content_sha256 ?? null,
      status: shouldAutoConfirm ? "auto_confirmed" : status,
      rejected_reason: rejectedReason,
      vault_item_id: dupVaultItemId ?? null, // backfilled for auto-confirm
      confirmed_at: shouldAutoConfirm ? new Date().toISOString() : null,
      confirmed_by: shouldAutoConfirm ? user.id : null,
    });
  }

  // ── Batch insert vault_items ──────────────────────────────────────
  const vaultItemIds: string[] = [];

  if (vaultItemInserts.length > 0) {
    const { data: insertedItems, error: vaultErr } = await supabaseAdmin
      .from("vault_items")
      .insert(vaultItemInserts)
      .select("id");

    if (vaultErr || !insertedItems) {
      // Vault insert failed — demote all auto-confirm entries to error.
      const errMsg = vaultErr?.message ?? "vault_items insert failed";
      for (const rIdx of autoConfirmResultIndices) {
        results[rIdx].status = "error";
        results[rIdx].error = errMsg;
      }
      // Fix matching watched_folder_files rows.
      for (const wf of watchedFileInserts) {
        if (wf.status === "auto_confirmed") {
          wf.status = "pending_user_confirm";
          wf.confirmed_at = null;
          wf.confirmed_by = null;
        }
      }
    } else {
      // Supabase returns rows in insertion order — zip them with the
      // autoConfirmResultIndices array to backfill vault_item_ids.
      const items = insertedItems as Array<{ id: string }>;
      for (let j = 0; j < items.length; j++) {
        const vid = items[j].id;
        vaultItemIds.push(vid);

        // Backfill into the results array.
        const rIdx = autoConfirmResultIndices[j];
        results[rIdx].vault_item_id = vid;

        // Backfill into the watched_folder_files row. The j-th
        // vaultItemInsert corresponds to the j-th auto-confirmed
        // watched_folder_files row (both are appended in the same loop
        // iteration). Walk watchedFileInserts looking for the matching
        // auto_confirmed row that still has null vault_item_id.
        const wf = watchedFileInserts.find(
          (w) =>
            w.status === "auto_confirmed" &&
            w.vault_item_id === null &&
            w.file_name === results[rIdx].file_name,
        );
        if (wf) wf.vault_item_id = vid;

        // Register the hash so later files in the same batch dedup.
        const sha = files.find(
          (fl) => fl.file_name === results[rIdx].file_name,
        )?.content_sha256;
        if (sha) hashToVaultId.set(sha, vid);
      }
    }
  }

  // ── Batch insert watched_folder_files ─────────────────────────────
  if (watchedFileInserts.length > 0) {
    const { error: wfErr } = await supabaseAdmin
      .from("watched_folder_files")
      .insert(watchedFileInserts);
    if (wfErr) {
      console.error(
        "[notify-batch] watched_folder_files insert failed:",
        wfErr.message,
      );
    }
  }

  // ── Enqueue ingest jobs for auto-confirmed vault items ────────────
  let queued = 0;
  for (const vid of vaultItemIds) {
    try {
      await enqueueIngest({
        vaultItemId: vid,
        workspaceId,
        requestedBy: user.id,
        source: "watched_folder",
      });
      queued++;
    } catch (err) {
      console.warn(
        `[notify-batch] enqueueIngest failed for ${vid}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── Kick worker + bump counter ────────────────────────────────────
  if (queued > 0) {
    const origin = new URL(req.url).origin;
    kickIngestWorker(origin);

    // Bump files_indexed_count by number of auto-confirmed files.
    for (let i = 0; i < queued; i++) {
      await supabaseAdmin
        .rpc("increment_watched_folder_count", { p_folder_id: folderId })
        .then(
          () => undefined,
          () => undefined,
        );
    }

    // Single audit-log entry for the batch.
    await supabaseAdmin
      .from("audit_logs")
      .insert({
        workspace_id: workspaceId,
        actor_id: user.id,
        action: "watched_folder_file.batch_auto_confirmed",
        target_type: "watched_folder",
        target_id: folderId,
        metadata: {
          count: queued,
          vault_item_ids: vaultItemIds,
        },
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return NextResponse.json({ results, queued });
}

function extractExt(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1] : "";
}
