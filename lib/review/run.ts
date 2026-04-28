// lib/review/run.ts
//
// Runs a Review Table extraction — one OpenAI call per (doc, column)
// cell. Cells are processed in parallel with a small concurrency cap
// so we get good wall-clock throughput without overwhelming the API.
// Each call is structured-output JSON; we parse + persist the cell
// row inline. Failures don't block the rest of the batch.

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ColumnKind =
  | "text"
  | "number"
  | "date"
  | "yes_no"
  | "currency"
  | "verbatim"
  | "list";

export interface ReviewColumn {
  id: string;
  name: string;
  prompt: string;
  kind: ColumnKind;
}

interface SupabaseLike {
  from: (table: string) => any;
}

interface RunInput {
  tableId: string;
  workspaceId: string;
  columns: ReviewColumn[];
  docIds: string[];
  /** When set, only cells matching these (doc_id, column_id) pairs
   *  are recomputed. Empty/undefined means "all pending cells." */
  onlyPending?: boolean;
  concurrency?: number;
}

interface RunResult {
  processed: number;
  done: number;
  failed: number;
}

const DEFAULT_CONCURRENCY = 5;
const MAX_CELLS_PER_RUN = 60; // safety cap so a single run can't burn through the budget

async function extractCell(
  docTitle: string,
  docContent: string,
  column: ReviewColumn
): Promise<{ value: string | null; citation: string | null; confidence: number } | { error: string }> {
  const kindHint =
    column.kind === "date"
      ? "Return the date in ISO 8601 (YYYY-MM-DD) format."
      : column.kind === "number"
      ? "Return only the numeric value, no units or commas."
      : column.kind === "yes_no"
      ? "Return exactly 'yes' or 'no'."
      : column.kind === "currency"
      ? "Return the dollar amount in the format '$<number>' (e.g. '$1,250,000'). Include the currency symbol; commas in long numbers are fine. If the doc states a different currency, prefix appropriately (e.g. '€', '£')."
      : column.kind === "verbatim"
      ? "Return a verbatim quote from the document, preserving exact wording. Do not paraphrase, summarize, or add commentary. The 'value' field IS the quote (no surrounding quotes needed; the citation field will repeat the same text)."
      : column.kind === "list"
      ? "Return a comma-separated list of items. Each item should be short (e.g. names, terms). No bullets, no numbering."
      : "Return a short, direct answer (one sentence max).";

  const systemPrompt = `You answer one question about one document. Output ONLY this JSON:

{ "value": "<answer or null if not derivable>", "citation": "<exact short verbatim snippet from the document, max ~150 chars, that backs the value>", "confidence": <0.0-1.0> }

Rules:
- ${kindHint}
- If the answer isn't in the document, set value to null and citation to null. Do NOT invent.
- The citation must be verbatim text from the document.
- confidence reflects how grounded the answer is (1.0 = directly stated, 0.5 = inferred, 0.0 = pure guess).`;

  const userPrompt = `## Document: ${docTitle}\n\n${docContent.slice(0, 14000)}\n\n## Question\n${column.prompt}`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
    const value =
      typeof parsed.value === "string" && parsed.value.trim().length > 0
        ? parsed.value
        : null;
    const citation =
      typeof parsed.citation === "string" && parsed.citation.trim().length > 0
        ? parsed.citation
        : null;
    const confidence =
      typeof parsed.confidence === "number" &&
      parsed.confidence >= 0 &&
      parsed.confidence <= 1
        ? parsed.confidence
        : 0.5;
    return { value, citation, confidence };
  } catch (e: any) {
    return { error: e?.message || "extract failed" };
  }
}

async function processBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array(Math.min(concurrency, items.length))
    .fill(0)
    .map(async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    });
  await Promise.all(workers);
  return out;
}

export async function runReviewTable(
  supabase: SupabaseLike,
  input: RunInput
): Promise<RunResult> {
  const { tableId, workspaceId, columns, docIds } = input;
  const concurrency = input.concurrency ?? DEFAULT_CONCURRENCY;

  // Identify which cells need to run. We always materialize pending
  // rows up front so the UI sees the empty grid immediately.
  const pendingPairs: Array<{ docId: string; column: ReviewColumn }> = [];
  const seedRows: any[] = [];
  for (const docId of docIds) {
    for (const col of columns) {
      pendingPairs.push({ docId, column: col });
      seedRows.push({
        table_id: tableId,
        doc_id: docId,
        column_id: col.id,
        status: "pending",
      });
    }
  }
  // Upsert pending shells (ignore conflicts on the composite key —
  // we only seed rows that don't exist yet).
  if (seedRows.length > 0) {
    await supabase
      .from("review_table_cells")
      .upsert(seedRows, { onConflict: "table_id,doc_id,column_id", ignoreDuplicates: true });
  }

  // Pull the cells that still need processing (status pending or failed).
  const { data: cellsToRun } = await supabase
    .from("review_table_cells")
    .select("doc_id, column_id, status")
    .eq("table_id", tableId)
    .in("status", input.onlyPending ? ["pending"] : ["pending", "failed"])
    .limit(MAX_CELLS_PER_RUN);

  const toRun: Array<{ docId: string; column: ReviewColumn }> = [];
  const colById = new Map(columns.map((c) => [c.id, c]));
  for (const c of cellsToRun || []) {
    const col = colById.get(c.column_id);
    if (col) toRun.push({ docId: c.doc_id, column: col });
  }
  if (toRun.length === 0) {
    return { processed: 0, done: 0, failed: 0 };
  }

  // Pull doc texts in one query.
  const uniqueDocIds = Array.from(new Set(toRun.map((t) => t.docId)));
  const { data: docs } = await supabase
    .from("vault_items")
    .select("id, title, content")
    .in("id", uniqueDocIds)
    .eq("workspace_id", workspaceId);
  const docById = new Map<string, { title: string; content: string }>(
    (docs || []).map((d: any) => [d.id, { title: d.title, content: d.content || "" }])
  );

  // Mark all running.
  await supabase
    .from("review_table_cells")
    .update({ status: "running" })
    .eq("table_id", tableId)
    .in(
      "doc_id",
      toRun.map((t) => t.docId)
    );

  let done = 0;
  let failed = 0;

  await processBatch(
    toRun,
    async ({ docId, column }) => {
      const doc = docById.get(docId);
      if (!doc || !doc.content || doc.content.trim().length < 20) {
        await supabase
          .from("review_table_cells")
          .update({
            status: "failed",
            value: null,
            citation: null,
            error: "Document text not ready (still extracting?)",
            updated_at: new Date().toISOString(),
          })
          .eq("table_id", tableId)
          .eq("doc_id", docId)
          .eq("column_id", column.id);
        failed++;
        return;
      }
      const out = await extractCell(doc.title, doc.content, column);
      if ("error" in out) {
        await supabase
          .from("review_table_cells")
          .update({
            status: "failed",
            error: out.error,
            updated_at: new Date().toISOString(),
          })
          .eq("table_id", tableId)
          .eq("doc_id", docId)
          .eq("column_id", column.id);
        failed++;
      } else {
        await supabase
          .from("review_table_cells")
          .update({
            status: "done",
            value: out.value,
            citation: out.citation,
            confidence: out.confidence,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("table_id", tableId)
          .eq("doc_id", docId)
          .eq("column_id", column.id);
        done++;
      }
    },
    concurrency
  );

  // Update parent table status.
  const status = failed > 0 && done === 0 ? "failed" : "complete";
  await supabase
    .from("review_tables")
    .update({ status, last_run_at: new Date().toISOString() })
    .eq("id", tableId);

  return { processed: toRun.length, done, failed };
}
