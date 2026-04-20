// lib/dante/archive/pipeline.ts
//
// End-to-end upload → index orchestrator for the Dante archive.
//
//   1. Caller uploads the raw file + metadata to /api/dante/archive/upload.
//   2. We insert a `dante_archive_documents` row with status=processing
//      so the UI shows the doc immediately (greyed out, spinner).
//   3. Upload the file bytes to the `dante-archive` storage bucket
//      under `<workspace_id>/<doc_id>.<ext>`.
//   4. Extract → chunk → embed → insert chunks.
//   5. Flip status to 'ready' (or 'error' with the message).
//
// We do the whole thing synchronously inside the upload handler.
// Typical 30-page PDF takes ~6-10s; a 200-page prospectus ~30s.
// For bigger corpora this should migrate to the background queue
// (phase 4?), but inline is fine until someone complains.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractFile } from "./extract";
import { chunkPages } from "./chunk";
import { embedTexts, toPgVector } from "./embed";
import type { ArchiveDocumentRow, ArchiveKind } from "./types";

const BUCKET = "dante-archive";

export interface IngestInput {
  workspaceId: string;
  uploadedBy: string | null;
  title: string;
  kind: ArchiveKind | null;
  tags: string[];
  sourceUrl: string | null;
  fileName: string;
  mimeType: string;
  buffer: ArrayBuffer;
}

export interface IngestResult {
  document: ArchiveDocumentRow;
  chunkCount: number;
}

export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const ext = (input.fileName.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "bin").toLowerCase();
  const docId = crypto.randomUUID();
  const storagePath = `${input.workspaceId}/${docId}.${ext}`;

  // 1. Insert metadata row up front so UI can show "processing"
  const { data: insertedDoc, error: insertErr } = await supabaseAdmin
    .from("dante_archive_documents")
    .insert({
      id: docId,
      workspace_id: input.workspaceId,
      title: input.title,
      kind: input.kind,
      tags: input.tags,
      storage_path: storagePath,
      mime_type: input.mimeType,
      byte_size: input.buffer.byteLength,
      source_url: input.sourceUrl,
      status: "processing",
      uploaded_by: input.uploadedBy,
    })
    .select("*")
    .single();
  if (insertErr || !insertedDoc) {
    throw new Error(`Failed to insert archive document: ${insertErr?.message || "unknown"}`);
  }

  try {
    // 2. Upload raw file to storage
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, new Uint8Array(input.buffer), {
        contentType: input.mimeType,
        upsert: true,
      });
    if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

    // 3. Extract text
    const { pages, pageCount } = await extractFile(input.buffer, input.mimeType);

    // 4. Chunk + embed
    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      throw new Error("No extractable text. Is this a scanned/image-only document?");
    }
    const vectors = await embedTexts(chunks.map((c) => c.content));

    // 5. Insert chunks. We stringify the embedding as a PG array
    // literal because the Supabase JS client doesn't know the pgvector
    // type — PostgREST accepts the string and casts server-side.
    const chunkRows = chunks.map((c, i) => ({
      document_id: docId,
      workspace_id: input.workspaceId,
      chunk_index: c.index,
      page_number: c.page,
      content: c.content,
      embedding: toPgVector(vectors[i]),
    }));

    // Batch insert to avoid a single giant request body.
    const BATCH = 100;
    for (let i = 0; i < chunkRows.length; i += BATCH) {
      const { error } = await supabaseAdmin
        .from("dante_archive_chunks")
        .insert(chunkRows.slice(i, i + BATCH));
      if (error) throw new Error(`Chunk insert: ${error.message}`);
    }

    // 6. Flip to ready
    const { data: readyDoc, error: updateErr } = await supabaseAdmin
      .from("dante_archive_documents")
      .update({
        status: "ready",
        page_count: pageCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", docId)
      .select("*")
      .single();
    if (updateErr || !readyDoc) throw new Error(`Status update: ${updateErr?.message}`);

    return { document: readyDoc as ArchiveDocumentRow, chunkCount: chunks.length };
  } catch (err) {
    // Mark the row as errored so the UI can show the reason. We don't
    // delete it — keeping a tombstone lets users see what failed and
    // retry without re-uploading.
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("dante_archive_documents")
      .update({ status: "error", error: msg, updated_at: new Date().toISOString() })
      .eq("id", docId);
    throw err;
  }
}

/** Delete doc + its chunks + its storage object. Used by the DELETE route. */
export async function deleteDocument(workspaceId: string, docId: string): Promise<void> {
  const { data: doc } = await supabaseAdmin
    .from("dante_archive_documents")
    .select("id, storage_path")
    .eq("id", docId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!doc) return; // idempotent: already gone

  // Chunks go via ON DELETE CASCADE; storage has no cascade so we
  // have to remove the object explicitly.
  await supabaseAdmin.storage.from(BUCKET).remove([doc.storage_path]).catch(() => {});
  await supabaseAdmin.from("dante_archive_documents").delete().eq("id", docId);
}
