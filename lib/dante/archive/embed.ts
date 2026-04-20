// lib/dante/archive/embed.ts
//
// Thin OpenAI embedding wrapper. We use `text-embedding-3-small` at
// 1536 dimensions — cheap ($0.02 / 1M tokens), good enough for long-
// document retrieval, and dimension-compatible with the pgvector
// column in dante_archive_chunks.
//
// The API accepts up to 2048 inputs per call; we batch here so a
// 400-page document doesn't fire 400 HTTP calls.

const MODEL = "text-embedding-3-small";
const DIMS = 1536;
const BATCH = 96; // conservative — stay well under the 2048 ceiling

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, input: slice }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json() as { data: Array<{ embedding: number[] }> };
    for (const row of json.data) {
      if (!Array.isArray(row.embedding) || row.embedding.length !== DIMS) {
        throw new Error(`OpenAI returned ${row.embedding?.length ?? 0}-dim vector, expected ${DIMS}`);
      }
      out.push(row.embedding);
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
