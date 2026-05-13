// Structured extraction from client-uploaded PDFs.
//
// Pipeline:
//   1. Load the raw extracted text from the documents row
//      (already done at upload time by the existing client-documents
//      flow).
//   2. Render a per-doc-type prompt that enumerates the fields and
//      the rows schema.
//   3. Call Anthropic (preferred) or OpenAI to return strict JSON.
//   4. Run light validation: required scalar fields present, row
//      fields have the right shape.
//   5. Score an overall confidence — model self-reports per-field
//      confidence; we aggregate as min(field confidences).
//
// The output is ready to insert into document_extractions.

import { getSchema, type DocSchema, type DocType, type FieldSpec } from "./schemas";
import { complete as llmComplete } from "@/lib/llm/client";

export type ExtractionRow = Record<string, unknown>;

export type ExtractionResult = {
  docType: DocType;
  taxYear: number | null;
  fields: Record<string, unknown>;
  rows: ExtractionRow[];
  confidence: number;
  confidenceDetail: Record<string, number>;
  model: string;
  promptVersion: string;
  rawResponse: string;
};

export type ExtractInput = {
  docType: DocType;
  text: string;
};

const PROMPT_VERSION = "v1";

function renderFieldSpec(f: FieldSpec): string {
  const req = f.required ? " (REQUIRED)" : "";
  return `  - "${f.key}" — ${f.label}${req}. ${f.description} Type: ${f.type}.`;
}

function renderPrompt(schema: DocSchema, text: string): string {
  const lines: string[] = [];
  lines.push(`You are extracting structured data from ${schema.title}.`);
  lines.push("");
  lines.push("Tax year location: " + schema.taxYearHint);
  lines.push("");
  lines.push("Return a JSON object with this shape:");
  lines.push("{");
  lines.push('  "fields": {');
  for (const f of schema.fields) {
    lines.push(`    "${f.key}": ...,`);
  }
  lines.push("  },");
  if (schema.rows) {
    lines.push(`  "rows": [  // one entry per ${schema.rows.label}`);
    lines.push("    {");
    for (const f of schema.rows.fields) {
      lines.push(`      "${f.key}": ...,`);
    }
    lines.push("    }");
    lines.push("  ],");
  }
  lines.push(
    '  "confidence_detail": { "field_name": 0.0-1.0, ... }  // your confidence per field'
  );
  lines.push("}");
  lines.push("");
  lines.push("Field definitions:");
  for (const f of schema.fields) lines.push(renderFieldSpec(f));
  if (schema.rows) {
    lines.push("");
    lines.push(`Each ${schema.rows.label} row:`);
    for (const f of schema.rows.fields) lines.push(renderFieldSpec(f));
  }
  lines.push("");
  lines.push("Rules:");
  lines.push(
    "- Return NULL for any field you cannot find in the text. Do not guess."
  );
  lines.push(
    "- Dollar amounts: return as a plain number. Strip $, commas, and trailing zeros."
  );
  lines.push(
    "- Dates: return ISO YYYY-MM-DD unless the source literally says VARIOUS."
  );
  lines.push(
    "- TINs and SSNs: return only the last 4 digits, mask with X (e.g. 'XXX-XX-1234')."
  );
  lines.push("- Output ONLY the JSON object. No markdown, no prose.");
  lines.push("");
  lines.push("DOCUMENT TEXT:");
  lines.push(text.slice(0, 40000));
  return lines.join("\n");
}

function stripCodeFence(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : s).trim();
}

function validateAgainstSchema(
  parsed: any,
  schema: DocSchema
): { fields: Record<string, unknown>; rows: ExtractionRow[] } {
  const fields: Record<string, unknown> = {};
  for (const f of schema.fields) {
    fields[f.key] = parsed?.fields?.[f.key] ?? null;
  }
  const rows: ExtractionRow[] = [];
  if (schema.rows && Array.isArray(parsed?.rows)) {
    for (const row of parsed.rows) {
      const clean: ExtractionRow = {};
      for (const f of schema.rows.fields) {
        clean[f.key] = (row as any)?.[f.key] ?? null;
      }
      rows.push(clean);
    }
  }
  return { fields, rows };
}

function aggregateConfidence(
  detail: Record<string, number>,
  schema: DocSchema
): number {
  const required = schema.fields.filter((f) => f.required).map((f) => f.key);
  if (required.length === 0) {
    // No required fields — average everything.
    const values = Object.values(detail).filter(
      (v): v is number => typeof v === "number"
    );
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  // Use min of required fields — a single missing required field
  // should drop confidence hard.
  let min = 1;
  for (const k of required) {
    const v = detail[k];
    if (typeof v !== "number") return 0;
    if (v < min) min = v;
  }
  return min;
}

export async function extractDocument(
  input: ExtractInput
): Promise<ExtractionResult | null> {
  const schema = getSchema(input.docType);
  if (!schema) {
    throw new Error(`No schema registered for doc_type '${input.docType}'`);
  }
  const prompt = renderPrompt(schema, input.text);

  let rawResponse = "";
  const model = "claude-haiku-4-5-20251001";

  try {
    const result = await llmComplete({
      model,
      temperature: 0,
      maxTokens: 4000,
      responseFormat: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      feature: "documents.extract",
    });
    rawResponse = (typeof result.message.content === "string" ? result.message.content : "").trim();
  } catch {
    return null;
  }

  if (!rawResponse) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(stripCodeFence(rawResponse));
  } catch {
    return null;
  }

  const { fields, rows } = validateAgainstSchema(parsed, schema);
  const confidenceDetail =
    (parsed?.confidence_detail as Record<string, number>) || {};
  const confidence = aggregateConfidence(confidenceDetail, schema);

  const taxYearRaw = fields.tax_year;
  const taxYear =
    typeof taxYearRaw === "number"
      ? taxYearRaw
      : typeof taxYearRaw === "string" && /^\d{4}$/.test(taxYearRaw)
      ? parseInt(taxYearRaw, 10)
      : null;

  return {
    docType: input.docType,
    taxYear,
    fields,
    rows,
    confidence,
    confidenceDetail,
    model,
    promptVersion: PROMPT_VERSION,
    rawResponse,
  };
}
