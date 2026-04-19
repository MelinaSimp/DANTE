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
  anthropicKey?: string;
  openaiKey?: string;
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
  let model = "";

  if (input.anthropicKey) {
    model = "claude-sonnet-4-5";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": input.anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (r.ok) {
      const d = await r.json();
      rawResponse = (d.content || [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text || "")
        .join("")
        .trim();
    }
  }
  if (!rawResponse && input.openaiKey) {
    model = "gpt-4o-mini";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (r.ok) {
      const d = await r.json();
      rawResponse = (d.choices?.[0]?.message?.content || "").trim();
    }
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
