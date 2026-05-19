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
const MAX_BATCH = 96;

const MAX_CHARS_PER_CHUNK = 24000;
// OpenAI limit: 300K tokens per request. At ~4 chars/token, budget 900K chars
// with margin. Dense numeric data tokenizes at ~2 chars/token so be conservative.
const MAX_CHARS_PER_BATCH = 600_000;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const truncated = texts.map((t) =>
    t.length > MAX_CHARS_PER_CHUNK ? t.slice(0, MAX_CHARS_PER_CHUNK) : t,
  );

  const out: number[][] = [];
  let i = 0;
  while (i < truncated.length) {
    let batchChars = 0;
    let j = i;
    while (j < truncated.length && j - i < MAX_BATCH) {
      const nextChars = batchChars + truncated[j].length;
      if (nextChars > MAX_CHARS_PER_BATCH && j > i) break;
      batchChars = nextChars;
      j++;
    }

    const slice = truncated.slice(i, j);
    const vectors = await llmEmbed({ model: MODEL, input: slice });
    for (const vec of vectors) {
      if (!Array.isArray(vec) || vec.length !== DIMS) {
        throw new Error(`Embedding returned ${vec?.length ?? 0}-dim vector, expected ${DIMS}`);
      }
      out.push(vec);
    }
    i = j;
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
