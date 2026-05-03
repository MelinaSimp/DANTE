// lib/dante/archive/embed.ts
//
// Thin embedding wrapper. We use `text-embedding-3-small` at 1536
// dimensions — cheap ($0.02 / 1M tokens), good enough for long-
// document retrieval, and dimension-compatible with the pgvector
// column in dante_archive_chunks.
//
// The provider call goes through lib/llm/client.ts so a future
// provider swap doesn't require touching every embedding call site.
// We keep the batching here because OpenAI's 2048-input ceiling and
// our conservative 96-batch are an embeddings-specific detail.

import { embed as llmEmbed } from "@/lib/llm/client";

const MODEL = "text-embedding-3-small";
const DIMS = 1536;
const BATCH = 96; // conservative — stay well under the 2048 ceiling

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vectors = await llmEmbed({ model: MODEL, input: slice });
    for (const vec of vectors) {
      if (!Array.isArray(vec) || vec.length !== DIMS) {
        throw new Error(`Embedding returned ${vec?.length ?? 0}-dim vector, expected ${DIMS}`);
      }
      out.push(vec);
    }
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}

/** Postgres array literal — pgvector accepts this via the PostgREST body. */
export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
