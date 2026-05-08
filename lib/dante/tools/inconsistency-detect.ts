// lib/dante/tools/inconsistency-detect.ts
//
// Cross-document inconsistency detection. Takes a set of vault doc
// IDs and a question, returns structured contradictions — the
// thing Harvey explicitly says it cannot do.
//
// From Harvey's own help docs (current as of May 2026): "Cannot
// detect inconsistencies across multiple documents." This is one
// of the three explicitly disclaimed capabilities the panel-III
// synthesis identified as Drift's wedge. Building it makes the
// pitch concrete.
//
// Implementation: pull each doc's chunks, give them to gpt-4o-mini
// alongside the question, ask for structured findings (which
// docs contradict each other, what the contradiction is, the
// quote from each side). Keeps the prompt bounded by truncating
// each doc's content to a per-doc cap.
//
// Why a single LLM call rather than per-doc → reconcile: the
// contradictions are emergent from comparing the documents
// pairwise. A single prompt with all docs in context gives the
// model the chance to spot pairs we wouldn't query for explicitly.
// Cost: ~2-5K tokens for 3-5 docs, gpt-4o-mini, well under a
// penny per call.

import { complete as llmComplete } from "@/lib/llm/client";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface InconsistencyDetectInput {
  workspaceId: string;
  /** Vault doc IDs to compare. 2-8 is the sweet spot; we cap at 8
   *  so the prompt stays within bounds. */
  doc_ids: string[];
  /** What the user is asking about — "beneficiary designations",
   *  "fee schedules", "termination clauses", etc. The model uses
   *  this to focus the comparison; without it the model has to
   *  guess what dimensions to compare. */
  question: string;
}

export interface InconsistencyFinding {
  /** What the contradiction is, in plain English. */
  description: string;
  /** Severity — "high" means a real material contradiction; "medium"
   *  is a discrepancy worth flagging; "low" is wording variation
   *  that probably isn't substantive. */
  severity: "high" | "medium" | "low";
  /** The conflicting positions, one entry per document. */
  positions: Array<{
    doc_id: string;
    doc_title: string;
    quote: string;
  }>;
  /** What action this implies — "review and reconcile", "update X to
   *  match Y", "consult counsel", etc. */
  recommended_action: string | null;
}

export interface InconsistencyDetectResult {
  findings: InconsistencyFinding[];
  docs_considered: number;
  docs_with_content: number;
  /** When zero, no contradictions found across the supplied docs. */
  contradictions_found: number;
}

const MAX_DOCS = 8;
const MAX_CONTENT_PER_DOC = 4000; // chars
const MODEL = "claude-sonnet-4-6";

interface DocPayload {
  id: string;
  title: string;
  content: string;
}

async function loadDocs(
  workspaceId: string,
  docIds: string[],
): Promise<DocPayload[]> {
  // Pull title + concatenated chunk text. We use chunks rather than
  // the items.content field because chunks are the embedded units;
  // for very long docs, sample evenly across chunks rather than
  // truncating to the first 4K (sampling preserves later-section
  // contradictions like terminal clauses in trust documents).
  const { data: items } = await supabaseAdmin
    .from("vault_items")
    .select("id, title")
    .eq("workspace_id", workspaceId)
    .in("id", docIds);
  const titlesById = new Map<string, string>();
  for (const r of (items || []) as Array<{ id: string; title: string }>) {
    titlesById.set(r.id, r.title);
  }

  const out: DocPayload[] = [];
  for (const id of docIds) {
    const title = titlesById.get(id);
    if (!title) continue;
    const { data: chunks } = await supabaseAdmin
      .from("vault_item_chunks")
      .select("content, ord")
      .eq("item_id", id)
      .order("ord", { ascending: true });
    const arr = (chunks || []) as Array<{ content: string; ord: number }>;
    if (arr.length === 0) {
      out.push({ id, title, content: "" });
      continue;
    }
    // Sample evenly across the doc so terminal sections are
    // represented even when the doc is long.
    const joined = sampleEvenly(arr.map((c) => c.content), MAX_CONTENT_PER_DOC);
    out.push({ id, title, content: joined });
  }
  return out;
}

function sampleEvenly(parts: string[], maxChars: number): string {
  const total = parts.reduce((a, b) => a + b.length, 0);
  if (total <= maxChars) return parts.join("\n\n");
  // Take a proportional slice from each, keep order, separate with
  // an ellipsis marker so the model knows we truncated.
  const ratio = maxChars / total;
  const out: string[] = [];
  for (const p of parts) {
    const take = Math.max(120, Math.floor(p.length * ratio));
    if (p.length > take) {
      out.push(p.slice(0, take) + "…");
    } else {
      out.push(p);
    }
  }
  return out.join("\n\n");
}

function buildPrompt(input: InconsistencyDetectInput, docs: DocPayload[]): string {
  const docBlock = docs
    .map(
      (d, i) =>
        `[doc ${i + 1}] id=${d.id}\nTitle: ${d.title}\n---\n${
          d.content.trim() || "(empty)"
        }`,
    )
    .join("\n\n=====\n\n");

  return `Compare the documents below for contradictions about: ${input.question}

You are looking for material disagreements between documents — places where two documents make claims that cannot both be true, OR where one document says something the others don't address that materially changes the picture.

For each contradiction you find, output a finding with:
  - description: one-sentence plain English explanation of the contradiction
  - severity: "high" if it's a real material contradiction (different beneficiary names; conflicting payout instructions; fee schedules that differ on the same service); "medium" if it's a discrepancy worth flagging (different effective dates, different language for the same provision); "low" if it's likely just wording variation
  - positions: one entry per document IN CONFLICT. doc_id verbatim from the documents above. doc_title verbatim. quote: the EXACT phrase from that document that establishes its position. If a document is silent on the issue, do NOT include it in positions — only include documents that take an actual position.
  - recommended_action: one short sentence on what the user should do. "Reconcile X with Y", "Consult estate counsel", null when the contradiction is informational only.

If there are no contradictions, return findings: []. Do NOT invent contradictions to fill space.

DO NOT invent quotes. DO NOT invent doc_ids. DO NOT include documents that don't actually conflict on the question. Be honest about ambiguity.

Return strict JSON:
{
  "findings": [
    {
      "description": "...",
      "severity": "high" | "medium" | "low",
      "positions": [
        { "doc_id": "...", "doc_title": "...", "quote": "..." }
      ],
      "recommended_action": "..." | null
    }
  ]
}

DOCUMENTS:

${docBlock}`;
}

export async function detectInconsistencies(
  input: InconsistencyDetectInput,
): Promise<InconsistencyDetectResult> {
  const docIds = input.doc_ids.slice(0, MAX_DOCS);
  if (docIds.length < 2) {
    return {
      findings: [],
      docs_considered: docIds.length,
      docs_with_content: 0,
      contradictions_found: 0,
    };
  }

  const docs = await loadDocs(input.workspaceId, docIds);
  const docsWithContent = docs.filter((d) => d.content.trim().length > 0).length;
  if (docsWithContent < 2) {
    return {
      findings: [],
      docs_considered: docs.length,
      docs_with_content: docsWithContent,
      contradictions_found: 0,
    };
  }

  const prompt = buildPrompt(input, docs);
  const result = await llmComplete({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You compare regulated-industry documents for contradictions. Be honest — most document sets do not contradict each other. False positives erode trust; false negatives miss real fiduciary risk. Quote exactly. Never invent.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    responseFormat: { type: "json_object" },
    maxTokens: 1500,
  });

  let parsed: { findings?: unknown };
  try {
    parsed = JSON.parse(result.message.content || "{}");
  } catch {
    return {
      findings: [],
      docs_considered: docs.length,
      docs_with_content: docsWithContent,
      contradictions_found: 0,
    };
  }
  const raw = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: InconsistencyFinding[] = raw.map(normalizeFinding);
  return {
    findings,
    docs_considered: docs.length,
    docs_with_content: docsWithContent,
    contradictions_found: findings.length,
  };
}

function normalizeFinding(raw: unknown): InconsistencyFinding {
  const r = (raw || {}) as Record<string, unknown>;
  const severity = (r.severity as string) || "medium";
  return {
    description: String(r.description || "").trim(),
    severity: ["high", "medium", "low"].includes(severity)
      ? (severity as InconsistencyFinding["severity"])
      : "medium",
    positions: Array.isArray(r.positions)
      ? (r.positions as Array<Record<string, unknown>>).map((p) => ({
          doc_id: String(p.doc_id || ""),
          doc_title: String(p.doc_title || ""),
          quote: String(p.quote || "").trim(),
        }))
      : [],
    recommended_action:
      r.recommended_action != null && String(r.recommended_action).trim()
        ? String(r.recommended_action).trim()
        : null,
  };
}

export function formatInconsistenciesForPrompt(
  result: InconsistencyDetectResult,
): string {
  if (result.findings.length === 0) {
    return `(no contradictions found across ${result.docs_with_content} documents)`;
  }
  return result.findings
    .map((f, i) => {
      const positions = f.positions
        .map((p) => `  • ${p.doc_title}: "${p.quote}"`)
        .join("\n");
      return `[${i + 1}] (${f.severity.toUpperCase()}) ${f.description}\n${positions}${
        f.recommended_action
          ? `\n  → Recommended: ${f.recommended_action}`
          : ""
      }`;
    })
    .join("\n\n");
}
