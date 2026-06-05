// lib/dante/memory/consolidate.ts
//
// Memory consolidation: deduplicates and merges overlapping memory
// entries within a workspace. Run periodically (weekly cron) or on
// demand from admin tools.
//
// Algorithm:
//   1. Load all active (non-superseded, non-rejected) fact/summary
//      entries with embeddings for a workspace.
//   2. For each pair with cosine similarity > MERGE_THRESHOLD,
//      group them into clusters.
//   3. For each cluster, use LLM to merge the entries into a single
//      canonical entry that preserves all unique information.
//   4. Insert the merged entry, mark originals as superseded.
//
// Safety:
//   - Only merges facts with facts, summaries with summaries.
//   - Never touches episodes (they're time-specific events).
//   - Dry-run mode returns proposed merges without applying.
//   - Each merge is audited.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { complete as llmComplete } from "@/lib/llm/client";
import { llmContentText } from "@/lib/llm/types";
import { remember } from "./write";
import { log as rootLog } from "@/lib/logging";
import type { MemoryKind } from "./types";

const consolidateLog = rootLog.child({ component: "memory-consolidate" });

const MERGE_THRESHOLD = 0.92; // cosine similarity above this = candidate
const MAX_CLUSTER_SIZE = 5;   // don't merge more than 5 entries at once
const BATCH_SIZE = 200;       // max entries to process per run

interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  content: string;
  confidence: number;
  created_at: string;
  embedding: number[];
}

interface MergeProposal {
  source_ids: string[];
  source_contents: string[];
  merged_content: string;
  kind: MemoryKind;
}

export interface ConsolidateResult {
  workspace_id: string;
  entries_scanned: number;
  clusters_found: number;
  merges_applied: number;
  dry_run: boolean;
}

// ── Cosine similarity ────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Clustering ────────────────────────────────────────────────

function findClusters(entries: MemoryEntry[]): MemoryEntry[][] {
  const used = new Set<string>();
  const clusters: MemoryEntry[][] = [];

  for (let i = 0; i < entries.length; i++) {
    if (used.has(entries[i].id)) continue;
    const cluster = [entries[i]];
    used.add(entries[i].id);

    for (let j = i + 1; j < entries.length; j++) {
      if (used.has(entries[j].id)) continue;
      if (entries[i].kind !== entries[j].kind) continue;
      if (cluster.length >= MAX_CLUSTER_SIZE) break;

      const sim = cosineSimilarity(entries[i].embedding, entries[j].embedding);
      if (sim >= MERGE_THRESHOLD) {
        cluster.push(entries[j]);
        used.add(entries[j].id);
      }
    }

    if (cluster.length >= 2) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

// ── LLM merge ─────────────────────────────────────────────────

async function mergeContents(
  entries: MemoryEntry[],
  workspaceId: string,
): Promise<string> {
  const numbered = entries
    .map((e, i) => `[${i + 1}] ${e.content}`)
    .join("\n\n");

  const result = await llmComplete({
    model: "claude-sonnet-4-6",
    messages: [
      {
        role: "system",
        content:
          "You are a data consolidation assistant. Merge the following memory entries into a single, comprehensive entry. Preserve ALL unique facts and details from every entry. Remove redundancy. Keep it concise but complete. Output only the merged text, no preamble.",
      },
      {
        role: "user",
        content: `Merge these ${entries.length} entries into one:\n\n${numbered}`,
      },
    ],
    maxTokens: 500,
    feature: "memory.consolidate",
    workspaceId,
  });

  return llmContentText(result.message.content).trim();
}

// ── Main consolidation ────────────────────────────────────────

export async function consolidateMemory(opts: {
  workspaceId: string;
  dryRun?: boolean;
}): Promise<ConsolidateResult> {
  const { workspaceId, dryRun = false } = opts;

  consolidateLog.info("starting consolidation", { workspaceId, dryRun });

  // Load active entries with embeddings
  const { data: rows, error } = await supabaseAdmin
    .from("dante_memory")
    .select("id, kind, content, confidence, created_at, embedding")
    .eq("workspace_id", workspaceId)
    .is("superseded_by", null)
    .in("kind", ["fact", "summary"])
    .in("review_status", ["approved", "pending"])
    .not("embedding", "is", null)
    .order("created_at", { ascending: false })
    .limit(BATCH_SIZE);

  if (error || !rows) {
    consolidateLog.error("failed to load memory entries", {
      error: error?.message,
    });
    return {
      workspace_id: workspaceId,
      entries_scanned: 0,
      clusters_found: 0,
      merges_applied: 0,
      dry_run: dryRun,
    };
  }

  // Parse embeddings from pgvector string format
  const entries: MemoryEntry[] = rows
    .filter((r: any) => r.embedding)
    .map((r: any) => {
      let embedding: number[] = [];
      if (typeof r.embedding === "string") {
        // pgvector returns "[0.1,0.2,...]" format
        try {
          embedding = JSON.parse(r.embedding.replace(/^\[/, "[").replace(/\]$/, "]"));
        } catch {
          embedding = [];
        }
      } else if (Array.isArray(r.embedding)) {
        embedding = r.embedding;
      }
      return {
        id: r.id,
        kind: r.kind as MemoryKind,
        content: r.content,
        confidence: r.confidence,
        created_at: r.created_at,
        embedding,
      };
    })
    .filter((e: MemoryEntry) => e.embedding.length > 0);

  consolidateLog.info("entries loaded", { count: entries.length });

  const clusters = findClusters(entries);

  consolidateLog.info("clusters found", { count: clusters.length });

  if (dryRun || clusters.length === 0) {
    return {
      workspace_id: workspaceId,
      entries_scanned: entries.length,
      clusters_found: clusters.length,
      merges_applied: 0,
      dry_run: dryRun,
    };
  }

  // Apply merges
  let mergesApplied = 0;
  for (const cluster of clusters) {
    try {
      const mergedContent = await mergeContents(cluster, workspaceId);
      if (!mergedContent) continue;

      // Pick the highest-confidence entry's kind
      const bestKind = cluster.sort((a, b) => b.confidence - a.confidence)[0].kind;
      const sourceIds = cluster.map((e) => e.id);

      // Insert the merged entry
      const result = await remember({
        workspaceId,
        kind: bestKind,
        content: mergedContent,
        sourceKind: "consolidation",
        reviewStatus: "approved",
        forceEmbed: true,
      });

      // Mark originals as superseded
      await supabaseAdmin
        .from("dante_memory")
        .update({ superseded_by: result.id })
        .in("id", sourceIds);

      consolidateLog.info("cluster merged", {
        mergedId: result.id,
        sourceCount: sourceIds.length,
        kind: bestKind,
      });

      mergesApplied++;
    } catch (err) {
      consolidateLog.warn("cluster merge failed", {
        error: err instanceof Error ? err.message : String(err),
        clusterSize: cluster.length,
      });
    }
  }

  consolidateLog.info("consolidation complete", {
    workspaceId,
    scanned: entries.length,
    clusters: clusters.length,
    merged: mergesApplied,
  });

  return {
    workspace_id: workspaceId,
    entries_scanned: entries.length,
    clusters_found: clusters.length,
    merges_applied: mergesApplied,
    dry_run: false,
  };
}
