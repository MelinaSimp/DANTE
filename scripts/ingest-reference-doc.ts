// Reference library ingest — pulls a primary-source document (IRS Pub
// 590-B, SEC Reg BI, FINRA 2210, etc), extracts text, chunks it,
// embeds each chunk, and writes everything to reference_sources +
// reference_chunks.
//
// Usage:
//   npx tsx scripts/ingest-reference-doc.ts \
//     --source-key irs-pub-590b-2025 \
//     --title "IRS Publication 590-B — Distributions from IRAs (2025)" \
//     --authority IRS \
//     --url https://www.irs.gov/pub/irs-pdf/p590b.pdf \
//     --year 2025
//
// Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL +
// OPENAI_API_KEY in env.
//
// Why we ingest into our own DB rather than hit irs.gov live at query
// time: the URL can change, the PDF can be revised mid-year, and a
// compliance officer needs the exact bytes the model saw at cite time.
// We hash the content and store it so citations are stable even if the
// IRS updates the page.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type Args = {
  sourceKey: string;
  title: string;
  authority: string;
  url: string;
  year?: number;
  dryRun?: boolean;
  filePath?: string; // optional — use local file instead of fetching
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--source-key") args.sourceKey = next;
    else if (a === "--title") args.title = next;
    else if (a === "--authority") args.authority = next;
    else if (a === "--url") args.url = next;
    else if (a === "--year") args.year = parseInt(next, 10);
    else if (a === "--file") args.filePath = next;
    else if (a === "--dry-run") args.dryRun = true;
  }
  const required = ["sourceKey", "title", "authority", "url"] as const;
  for (const k of required) {
    if (!args[k]) {
      throw new Error(
        `Missing --${k.replace(/([A-Z])/g, "-$1").toLowerCase()}`
      );
    }
  }
  return args as Args;
}

// Pull bytes from either a local file (for testing offline) or the URL.
async function fetchBytes(url: string, filePath?: string): Promise<Buffer> {
  if (filePath) {
    return fs.readFileSync(path.resolve(filePath));
  }
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`Fetch failed: ${r.status} ${r.statusText}`);
  }
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

// Extract plain text from a PDF using pdf-parse (already a dep).
// Falls back to assuming the buffer is UTF-8 text for non-PDF sources.
async function extractText(bytes: Buffer, url: string): Promise<string> {
  const isPdf =
    url.toLowerCase().endsWith(".pdf") || bytes.slice(0, 4).toString() === "%PDF";
  if (!isPdf) {
    return bytes.toString("utf8");
  }
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  const result = await parser.getText();
  return (result as any).text || "";
}

// Chunk on paragraph boundaries with a target size. We overlap ~100 chars
// so a sentence that straddles two chunks still retrieves from both.
function chunkText(
  full: string,
  targetChars = 800,
  overlap = 100
): Array<{ content: string; charOffset: number }> {
  const normalized = full.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const chunks: Array<{ content: string; charOffset: number }> = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const end = Math.min(cursor + targetChars, normalized.length);
    // Try to break on a paragraph or sentence boundary within the window.
    let breakAt = end;
    if (end < normalized.length) {
      const slice = normalized.slice(cursor, end + 200);
      const paraBreak = slice.lastIndexOf("\n\n");
      const sentBreak = slice.lastIndexOf(". ");
      if (paraBreak > targetChars * 0.6) breakAt = cursor + paraBreak;
      else if (sentBreak > targetChars * 0.6) breakAt = cursor + sentBreak + 1;
    }
    const content = normalized.slice(cursor, breakAt).trim();
    if (content.length > 50) {
      chunks.push({ content, charOffset: cursor });
    }
    if (breakAt <= cursor) break;
    cursor = Math.max(breakAt - overlap, cursor + 1);
  }
  return chunks;
}

// Embed chunks in batches. OpenAI's text-embedding-3-small: 1536 dims,
// cheap (~$0.02/1M tokens), plenty good for retrieval.
async function embedBatch(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });
  if (!r.ok) {
    throw new Error(`OpenAI embed failed: ${r.status} ${await r.text()}`);
  }
  const d = await r.json();
  return d.data.map((x: any) => x.embedding as number[]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required"
    );
  }
  if (!openaiKey && !args.dryRun) {
    throw new Error("OPENAI_API_KEY required (or pass --dry-run to skip embedding)");
  }

  console.log(`→ Fetching ${args.url}${args.filePath ? ` (from local: ${args.filePath})` : ""}`);
  const bytes = await fetchBytes(args.url, args.filePath);
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
  console.log(`  ${bytes.length} bytes, sha256 ${contentHash.slice(0, 16)}…`);

  console.log(`→ Extracting text`);
  const content = await extractText(bytes, args.url);
  console.log(`  ${content.length} chars`);

  console.log(`→ Chunking`);
  const chunks = chunkText(content);
  console.log(`  ${chunks.length} chunks`);

  if (args.dryRun) {
    console.log(`\nDry run — skipping embed + DB write.`);
    console.log(`First chunk preview:\n  ${chunks[0]?.content.slice(0, 200)}…`);
    return;
  }

  console.log(`→ Upserting reference_sources row`);
  const supa = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: sourceRow, error: srcErr } = await supa
    .from("reference_sources")
    .upsert(
      {
        source_key: args.sourceKey,
        title: args.title,
        authority: args.authority,
        source_url: args.url,
        effective_year: args.year ?? null,
        content_hash: contentHash,
        content,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_key" }
    )
    .select("id")
    .single();
  if (srcErr || !sourceRow) {
    throw new Error(`Failed to upsert source: ${srcErr?.message}`);
  }
  const sourceId = sourceRow.id;
  console.log(`  source_id=${sourceId}`);

  // Delete existing chunks for this source+model (idempotent re-ingest).
  const model = "text-embedding-3-small";
  await supa
    .from("reference_chunks")
    .delete()
    .eq("source_id", sourceId)
    .eq("embedding_model", model);

  console.log(`→ Embedding + inserting chunks`);
  const BATCH = 64;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const embeddings = await embedBatch(
      batch.map((c) => c.content),
      openaiKey!
    );
    const rows = batch.map((c, j) => ({
      source_id: sourceId,
      chunk_index: i + j,
      content: c.content,
      char_offset: c.charOffset,
      embedding: embeddings[j],
      embedding_model: model,
    }));
    const { error } = await supa.from("reference_chunks").insert(rows);
    if (error) {
      throw new Error(`Insert chunks failed at batch ${i}: ${error.message}`);
    }
    process.stdout.write(`  ${i + batch.length}/${chunks.length}\r`);
  }
  console.log(`\n✓ Ingested ${chunks.length} chunks for ${args.sourceKey}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
