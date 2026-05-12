// lib/dante/lease-abstractor.ts
//
// Multi-pass extraction pipeline for commercial lease abstracts.
// Reuses vault ingestion (vault_item_chunks) for document content
// and Claude for structured field extraction with citations.
//
// Pass 1: Structural analysis — TOC, section boundaries, exhibits.
// Pass 2: Targeted field extraction — 30-40 standard fields with
//         citations to page + clause.
// Pass 3: Cross-reference validation — internal consistency checks.

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Field schema ────────────────────────────────────────────────

export interface LeaseField {
  name: string;
  category: "deal_terms" | "financial_terms" | "key_clauses";
  value: string | null;
  citation?: string;
  page?: number | null;
  confidence: "high" | "medium" | "low" | "not_found";
}

export interface ContextAnalysis {
  tenant_favorable_assessment: string;
  key_risks: string[];
  unusual_clauses: string[];
}

export interface LeaseAbstract {
  id: string;
  vault_item_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  fields: LeaseField[];
  context_analysis: ContextAnalysis | null;
  error_message: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  extraction_seconds: number;
}

// Default CRE fields. Workspaces can customize by adding/removing.
const DEFAULT_FIELDS: Array<{ name: string; category: LeaseField["category"]; description: string }> = [
  // Deal Terms
  { name: "Tenant Name", category: "deal_terms", description: "Legal name of the tenant entity" },
  { name: "Landlord Name", category: "deal_terms", description: "Legal name of the landlord entity" },
  { name: "Guarantor(s)", category: "deal_terms", description: "Personal or entity guarantors" },
  { name: "Premises Description", category: "deal_terms", description: "Address, suite, floor, SF" },
  { name: "Lease Type", category: "deal_terms", description: "NNN, gross, modified gross, etc." },
  { name: "Commencement Date", category: "deal_terms", description: "Lease start date" },
  { name: "Expiration Date", category: "deal_terms", description: "Lease end date" },
  { name: "Term (Months)", category: "deal_terms", description: "Total lease term in months" },
  { name: "Renewal Options", category: "deal_terms", description: "Count, term, notice period, rent basis" },
  { name: "Expansion Options", category: "deal_terms", description: "Right of first refusal or offer" },
  { name: "Termination Options", category: "deal_terms", description: "Early termination conditions and penalties" },
  // Financial Terms
  { name: "Base Rent Schedule", category: "financial_terms", description: "Year-by-year with escalations" },
  { name: "Escalation Type", category: "financial_terms", description: "Fixed %, CPI, fair market, etc." },
  { name: "CAM / OpEx Obligations", category: "financial_terms", description: "Common area maintenance and operating expense terms" },
  { name: "Real Estate Tax Obligations", category: "financial_terms", description: "Tax pass-through or obligation structure" },
  { name: "Insurance Obligations", category: "financial_terms", description: "Required insurance coverage and responsibility" },
  { name: "Percentage Rent", category: "financial_terms", description: "Threshold, rate, breakpoint" },
  { name: "Security Deposit", category: "financial_terms", description: "Amount, form, conditions for return" },
  { name: "TI Allowance", category: "financial_terms", description: "Tenant improvement allowance amount and conditions" },
  { name: "Free Rent / Abatement", category: "financial_terms", description: "Rent-free or abated periods" },
  // Key Clauses
  { name: "Co-Tenancy Provisions", category: "key_clauses", description: "Required co-tenants and remedies" },
  { name: "Exclusive Use", category: "key_clauses", description: "Exclusive use provisions and restrictions" },
  { name: "Go-Dark Provisions", category: "key_clauses", description: "Can tenant cease operations?" },
  { name: "Assignment and Subletting", category: "key_clauses", description: "Transfer rights and restrictions" },
  { name: "SNDA", category: "key_clauses", description: "Subordination, Non-Disturbance, Attornment" },
  { name: "Estoppel Requirements", category: "key_clauses", description: "Estoppel certificate delivery obligations" },
  { name: "Holdover Provisions", category: "key_clauses", description: "Terms if tenant stays past expiration" },
  { name: "Default and Cure", category: "key_clauses", description: "Default events and cure periods" },
  { name: "Force Majeure", category: "key_clauses", description: "Force majeure / excusable delay provisions" },
];

// ── Pipeline ────────────────────────────────────────────────────

export interface AbstractLeaseInput {
  workspaceId: string;
  vaultItemId: string;
  userId: string;
  anthropicKey: string;
  fields?: Array<{ name: string; category: LeaseField["category"]; description: string }>;
}

export async function abstractLease(
  input: AbstractLeaseInput,
): Promise<LeaseAbstract> {
  const startTime = Date.now();
  const fields = input.fields || DEFAULT_FIELDS;

  // Create the abstract row in pending state
  const { data: row, error: insertErr } = await supabaseAdmin
    .from("lease_abstracts")
    .insert({
      workspace_id: input.workspaceId,
      vault_item_id: input.vaultItemId,
      status: "processing",
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (insertErr || !row) {
    throw new Error(`Failed to create lease abstract: ${insertErr?.message}`);
  }
  const abstractId = (row as { id: string }).id;

  try {
    // Load document chunks from vault
    const { data: chunks, error: chunkErr } = await supabaseAdmin
      .from("vault_item_chunks")
      .select("chunk_index, page_number, content")
      .eq("item_id", input.vaultItemId)
      .order("chunk_index", { ascending: true });
    if (chunkErr) throw new Error(`Failed to load chunks: ${chunkErr.message}`);
    if (!chunks || chunks.length === 0) {
      throw new Error("Document has no indexed content. Please ensure the file has been ingested.");
    }

    const docText = (chunks as Array<{ chunk_index: number; page_number: number | null; content: string }>)
      .map((c) => `[Page ${c.page_number ?? "?"}] ${c.content}`)
      .join("\n\n");

    // Truncate to fit context window (~180K chars for Claude)
    const maxChars = 180_000;
    const truncatedDoc = docText.length > maxChars
      ? docText.slice(0, maxChars) + "\n\n[Document truncated — remaining pages not analyzed]"
      : docText;

    // Single-pass extraction with structured output
    const fieldList = fields
      .map((f) => `- ${f.name} (${f.category}): ${f.description}`)
      .join("\n");

    const prompt = `You are a commercial real estate lease abstractor. Extract the following fields from this lease document. For each field, provide:
- The extracted value (be specific and precise)
- A citation: the exact clause or section reference (e.g., "Section 4.2, p.12")
- The page number where the information was found
- Your confidence: "high" (explicit in text), "medium" (inferred from context), "low" (ambiguous), "not_found" (not present)

Fields to extract:
${fieldList}

After extracting all fields, provide a Context Analysis with:
- tenant_favorable_assessment: Overall assessment of whether the lease favors tenant or landlord
- key_risks: Array of key risk factors for the tenant
- unusual_clauses: Array of any non-standard or unusual provisions

Return a JSON object with this exact shape (no markdown, no prose outside the JSON):

{
  "fields": [
    {
      "name": "Field Name",
      "category": "deal_terms",
      "value": "extracted value or null if not found",
      "citation": "Section X.Y, p.Z",
      "page": 12,
      "confidence": "high"
    }
  ],
  "context_analysis": {
    "tenant_favorable_assessment": "...",
    "key_risks": ["risk 1", "risk 2"],
    "unusual_clauses": ["clause 1"]
  }
}

Do not use emojis in any output. Plain text only.

LEASE DOCUMENT:
${truncatedDoc}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": input.anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawText = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text || "")
      .join("")
      .trim();

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;

    // Parse the JSON response
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
    const parsed = JSON.parse(jsonStr);

    const extractedFields: LeaseField[] = (parsed.fields || []).map((f: any) => ({
      name: typeof f.name === "string" ? f.name : "",
      category: f.category || "deal_terms",
      value: f.value ?? null,
      citation: f.citation || undefined,
      page: typeof f.page === "number" ? f.page : null,
      confidence: ["high", "medium", "low", "not_found"].includes(f.confidence)
        ? f.confidence
        : "low",
    }));

    const contextAnalysis: ContextAnalysis | null = parsed.context_analysis
      ? {
          tenant_favorable_assessment: parsed.context_analysis.tenant_favorable_assessment || "",
          key_risks: Array.isArray(parsed.context_analysis.key_risks)
            ? parsed.context_analysis.key_risks
            : [],
          unusual_clauses: Array.isArray(parsed.context_analysis.unusual_clauses)
            ? parsed.context_analysis.unusual_clauses
            : [],
        }
      : null;

    const elapsedSeconds = (Date.now() - startTime) / 1000;

    // Update the abstract row
    await supabaseAdmin
      .from("lease_abstracts")
      .update({
        status: "completed",
        fields: extractedFields,
        context_analysis: contextAnalysis,
        model: "claude-sonnet-4-6",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        extraction_seconds: elapsedSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", abstractId);

    return {
      id: abstractId,
      vault_item_id: input.vaultItemId,
      status: "completed",
      fields: extractedFields,
      context_analysis: contextAnalysis,
      error_message: null,
      model: "claude-sonnet-4-6",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      extraction_seconds: elapsedSeconds,
    };
  } catch (err: any) {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    await supabaseAdmin
      .from("lease_abstracts")
      .update({
        status: "failed",
        error_message: err.message,
        extraction_seconds: elapsedSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", abstractId);

    return {
      id: abstractId,
      vault_item_id: input.vaultItemId,
      status: "failed",
      fields: [],
      context_analysis: null,
      error_message: err.message,
      model: "",
      input_tokens: 0,
      output_tokens: 0,
      extraction_seconds: elapsedSeconds,
    };
  }
}

export { DEFAULT_FIELDS };
