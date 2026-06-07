// lib/dante/lease-abstractor.ts
//
// Three-pass extraction pipeline for commercial lease abstracts.
//
// Pass 1: Structural analysis — identify sections, page ranges, exhibits.
// Pass 2: Targeted field extraction — for each field group, select
//         relevant chunks from the structural map and extract values
//         with [vN] citation markers (page-level).
// Pass 3: Cross-reference validation — verify internal consistency
//         (commencement + term = expiration, rent schedule matches, etc).

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
  anchor_leverage?: string;
  cross_reference_issues: string[];
  market_context?: string;
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

// ── Types ──────────────────────────────────────────────────────

interface ChunkRow {
  chunk_index: number;
  page_number: number | null;
  content: string;
}

interface SectionMap {
  sections: Array<{
    name: string;
    page_start: number;
    page_end: number;
    relevance: string[];
  }>;
  exhibits: Array<{ label: string; description: string; page: number }>;
  total_pages: number;
}

export interface AbstractLeaseInput {
  workspaceId: string;
  vaultItemId: string;
  userId: string;
  anthropicKey: string;
  fields?: Array<{ name: string; category: LeaseField["category"]; description: string }>;
  options?: {
    refinePrompt?: boolean;
    webSearch?: boolean;
  };
}

// ── Claude API call helper ─────────────────────────────────────

async function callClaude(
  apiKey: string,
  prompt: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: opts.maxTokens ?? 12000,
      temperature: opts.temperature ?? 0.1,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text?: string }) => b.text || "")
    .join("")
    .trim();

  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

export function parseJSON(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : raw.trim();
  return JSON.parse(jsonStr);
}

/**
 * Parse a date string extracted by the LLM into ISO YYYY-MM-DD for
 * the denormalized expiration_date column. The model typically returns
 * ISO-ish formats ("2028-12-31") but can also return natural language
 * ("December 31, 2028"). Returns null for unparseable values.
 */
export function parseLeaseDate(raw: string | null): string | null {
  if (!raw) return null;
  // Try ISO first
  const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  // Try natural language
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// ── Pass 1: Structural analysis ────────────────────────────────

async function pass1Structure(
  chunks: ChunkRow[],
  apiKey: string,
): Promise<{ map: SectionMap; tokens: { input: number; output: number } }> {
  // Use first ~60K chars for structure identification
  const structureText = chunks
    .map((c) => `[Page ${c.page_number ?? "?"}] ${c.content}`)
    .join("\n\n")
    .slice(0, 60_000);

  const prompt = `You are a commercial real estate lease analyst. Analyze this lease document and produce a structural map.

Identify:
1. All major sections with their page ranges and what fields they're relevant to
2. All exhibits/addenda with their labels and page numbers
3. Total page count

For section relevance, use these field categories: deal_terms, financial_terms, key_clauses

Return JSON only (no prose):
{
  "sections": [
    { "name": "Section name or number", "page_start": 1, "page_end": 5, "relevance": ["deal_terms", "financial_terms"] }
  ],
  "exhibits": [
    { "label": "Exhibit A", "description": "Floor plan", "page": 45 }
  ],
  "total_pages": 50
}

LEASE DOCUMENT (excerpt for structure):
${structureText}`;

  const result = await callClaude(apiKey, prompt, { maxTokens: 4000 });
  const map = parseJSON(result.text) as SectionMap;
  return { map, tokens: { input: result.inputTokens, output: result.outputTokens } };
}

// ── Pass 2: Targeted field extraction ──────────────────────────

async function pass2Extract(
  chunks: ChunkRow[],
  sectionMap: SectionMap,
  fields: Array<{ name: string; category: LeaseField["category"]; description: string }>,
  apiKey: string,
): Promise<{
  fields: LeaseField[];
  context: ContextAnalysis;
  tokens: { input: number; output: number };
}> {
  // Build a targeted document view: for each field category, include
  // chunks from relevant sections. This keeps the context focused
  // even for 200-page documents.
  const categoryChunks: Record<string, ChunkRow[]> = {
    deal_terms: [],
    financial_terms: [],
    key_clauses: [],
  };

  for (const chunk of chunks) {
    const page = chunk.page_number ?? 0;
    for (const section of sectionMap.sections) {
      if (page >= section.page_start && page <= section.page_end) {
        for (const rel of section.relevance) {
          if (categoryChunks[rel] && !categoryChunks[rel].includes(chunk)) {
            categoryChunks[rel].push(chunk);
          }
        }
      }
    }
    // If no section matched, include in all categories (safety net
    // for documents with poor section structure)
    const matched = sectionMap.sections.some(
      (s) => page >= s.page_start && page <= s.page_end,
    );
    if (!matched) {
      for (const cat of Object.keys(categoryChunks)) {
        if (!categoryChunks[cat].includes(chunk)) {
          categoryChunks[cat].push(chunk);
        }
      }
    }
  }

  // Deduplicate and build the focused document text
  const seen = new Set<number>();
  const relevantChunks: ChunkRow[] = [];
  for (const cat of Object.values(categoryChunks)) {
    for (const c of cat) {
      if (!seen.has(c.chunk_index)) {
        seen.add(c.chunk_index);
        relevantChunks.push(c);
      }
    }
  }
  relevantChunks.sort((a, b) => a.chunk_index - b.chunk_index);

  const docText = relevantChunks
    .map((c) => `[Page ${c.page_number ?? "?"}] ${c.content}`)
    .join("\n\n");

  // Cap at 160K chars — with targeted chunks this should rarely trigger
  const maxChars = 160_000;
  const truncated = docText.length > maxChars;
  const finalDoc = truncated
    ? docText.slice(0, maxChars) + "\n\n[Document truncated at 160K chars — some later sections may be missing]"
    : docText;

  const fieldList = fields
    .map((f) => `- ${f.name} (${f.category}): ${f.description}`)
    .join("\n");

  const prompt = `You are a commercial real estate lease abstractor. Extract the following fields from this lease document.

CITATION FORMAT: For every extracted value, cite the source using [v<page_number>] format. Example: "5,000 SF [v12]" means found on page 12. Use the page numbers from the [Page N] markers in the document.

For each field, provide:
- value: The extracted value with inline [vN] citation (be specific and precise)
- page: The primary page number where found
- confidence: "high" (explicit in text), "medium" (inferred), "low" (ambiguous), "not_found" (absent)

Fields to extract:
${fieldList}

After fields, provide a Context Analysis:
- tenant_favorable_assessment: Who does this lease favor and why?
- key_risks: Array of key risk factors
- unusual_clauses: Array of non-standard provisions
- anchor_leverage: Assessment of anchor tenant or co-tenancy leverage if applicable
- cross_reference_issues: Leave as empty array (Pass 3 will fill this)

Return JSON only:
{
  "fields": [
    { "name": "Field Name", "category": "deal_terms", "value": "extracted value [vN]", "page": 12, "confidence": "high" }
  ],
  "context_analysis": {
    "tenant_favorable_assessment": "...",
    "key_risks": [],
    "unusual_clauses": [],
    "anchor_leverage": "...",
    "cross_reference_issues": []
  }
}${truncated ? "\n\nNOTE: Document was truncated. Mark any fields you cannot verify from the available text as confidence: 'low' with a note." : ""}

LEASE DOCUMENT:
${finalDoc}`;

  const result = await callClaude(apiKey, prompt, { maxTokens: 16000 });
  const parsed = parseJSON(result.text) as {
    fields: Array<{
      name: string;
      category?: string;
      value: string | null;
      citation?: string;
      page?: number;
      confidence?: string;
    }>;
    context_analysis?: Partial<ContextAnalysis>;
  };

  const extractedFields: LeaseField[] = (parsed.fields || []).map((f) => {
    const fieldDef = fields.find((d) => d.name === f.name);
    return {
      name: f.name || "",
      category: (fieldDef?.category || f.category || "deal_terms") as LeaseField["category"],
      value: f.value ?? null,
      citation: extractCitationFromValue(f.value),
      page: typeof f.page === "number" ? f.page : null,
      confidence: (["high", "medium", "low", "not_found"].includes(f.confidence || "")
        ? f.confidence
        : "low") as LeaseField["confidence"],
    };
  });

  const ca = parsed.context_analysis;
  const context: ContextAnalysis = {
    tenant_favorable_assessment: ca?.tenant_favorable_assessment || "",
    key_risks: Array.isArray(ca?.key_risks) ? ca.key_risks : [],
    unusual_clauses: Array.isArray(ca?.unusual_clauses) ? ca.unusual_clauses : [],
    anchor_leverage: ca?.anchor_leverage,
    cross_reference_issues: [],
  };

  return {
    fields: extractedFields,
    context,
    tokens: { input: result.inputTokens, output: result.outputTokens },
  };
}

export function extractCitationFromValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const matches = value.match(/\[v(\d+)\]/g);
  if (!matches) return undefined;
  return matches.join(", ");
}

// ── Pass 3: Cross-reference validation ─────────────────────────

async function pass3Validate(
  fields: LeaseField[],
  context: ContextAnalysis,
  apiKey: string,
): Promise<{
  issues: string[];
  tokens: { input: number; output: number };
}> {
  const fieldSummary = fields
    .filter((f) => f.value && f.confidence !== "not_found")
    .map((f) => `${f.name}: ${f.value}`)
    .join("\n");

  const prompt = `You are a commercial real estate lease reviewer. Check these extracted lease fields for internal consistency.

Verify:
1. Commencement date + term = expiration date (do they match?)
2. Base rent schedule matches escalation type (e.g., 3% annual escalation reflected in year-over-year amounts)
3. NNN lease type should have CAM, tax, and insurance obligations defined
4. Security deposit amount is reasonable relative to rent
5. Any dates that conflict with each other
6. Any numerical inconsistencies

EXTRACTED FIELDS:
${fieldSummary}

Return JSON only:
{
  "issues": ["description of each inconsistency found"],
  "all_consistent": true/false
}

If everything is consistent, return an empty issues array.`;

  const result = await callClaude(apiKey, prompt, { maxTokens: 2000 });
  const parsed = parseJSON(result.text) as { issues: string[] };
  return {
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    tokens: { input: result.inputTokens, output: result.outputTokens },
  };
}

// ── Optional: Prompt refinement pass ───────────────────────────

async function passRefinePrompt(
  chunks: ChunkRow[],
  sectionMap: SectionMap,
  fields: Array<{ name: string; category: LeaseField["category"]; description: string }>,
  apiKey: string,
): Promise<{
  refinedDescriptions: Record<string, string>;
  tokens: { input: number; output: number };
}> {
  const sampleText = chunks
    .slice(0, 10)
    .map((c) => `[Page ${c.page_number ?? "?"}] ${c.content}`)
    .join("\n\n")
    .slice(0, 30_000);

  const sectionSummary = sectionMap.sections
    .map((s) => `${s.name} (pp. ${s.page_start}-${s.page_end})`)
    .join(", ");

  const fieldNames = fields.map((f) => f.name).join(", ");

  const prompt = `You are a lease abstraction prompt engineer. Analyze this lease's structure and terminology to produce optimized field descriptions that will improve extraction accuracy.

LEASE STRUCTURE: ${sectionSummary}
FIELDS TO EXTRACT: ${fieldNames}

LEASE SAMPLE (first 10 chunks):
${sampleText}

For each field, write a refined description that:
- Uses the exact terminology found in THIS lease (e.g., "Basic Annual Rent" instead of generic "Base Rent")
- Notes which section the field is likely found in
- Calls out any unusual formatting or structure

Return JSON only:
{
  "refined_descriptions": {
    "Field Name": "Optimized extraction description tailored to this lease's language"
  }
}`;

  const result = await callClaude(apiKey, prompt, { maxTokens: 6000 });
  const parsed = parseJSON(result.text) as {
    refined_descriptions: Record<string, string>;
  };
  return {
    refinedDescriptions: parsed.refined_descriptions || {},
    tokens: { input: result.inputTokens, output: result.outputTokens },
  };
}

// ── Optional: Web search for market context ───────────────────

async function passWebSearch(
  fields: LeaseField[],
  apiKey: string,
): Promise<{
  marketContext: string;
  tokens: { input: number; output: number };
}> {
  const address = fields.find((f) => f.name === "Premises Description")?.value || "";
  const tenant = fields.find((f) => f.name === "Tenant Name")?.value || "";
  const landlord = fields.find((f) => f.name === "Landlord Name")?.value || "";
  const leaseType = fields.find((f) => f.name === "Lease Type")?.value || "";
  const baseRent = fields.find((f) => f.name === "Base Rent Schedule")?.value || "";

  if (!address && !tenant) {
    return { marketContext: "", tokens: { input: 0, output: 0 } };
  }

  const prompt = `You are a commercial real estate market analyst. Based on the following extracted lease details, provide market context and comparable analysis.

PROPERTY: ${address}
TENANT: ${tenant}
LANDLORD: ${landlord}
LEASE TYPE: ${leaseType}
BASE RENT: ${baseRent}

Provide a concise market context analysis covering:
1. How does this rent compare to typical rates for this property type and area?
2. Are the lease terms (NNN/gross/modified) standard for this market?
3. Any notable market conditions that affect this lease's value
4. Tenant credit quality assessment if the tenant is a known entity

Keep your response under 300 words. Be factual and cite specific market knowledge where possible. If you don't have enough information about the specific market, say so rather than speculating.

Return JSON only:
{
  "market_context": "Your analysis here",
  "comparable_assessment": "How this lease compares to market",
  "tenant_credit_notes": "Any known information about tenant creditworthiness"
}`;

  const result = await callClaude(apiKey, prompt, { maxTokens: 2000 });
  const parsed = parseJSON(result.text) as {
    market_context?: string;
    comparable_assessment?: string;
    tenant_credit_notes?: string;
  };

  const parts = [
    parsed.market_context,
    parsed.comparable_assessment,
    parsed.tenant_credit_notes,
  ].filter(Boolean);

  return {
    marketContext: parts.join("\n\n"),
    tokens: { input: result.inputTokens, output: result.outputTokens },
  };
}

// ── Pipeline ──────────────────────────────────────────────────

export async function abstractLease(
  input: AbstractLeaseInput,
): Promise<LeaseAbstract> {
  const startTime = Date.now();
  const opts = input.options || {};
  let fields = input.fields || DEFAULT_FIELDS;

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

  let totalInput = 0;
  let totalOutput = 0;

  try {
    const { data: chunks, error: chunkErr } = await supabaseAdmin
      .from("vault_item_chunks")
      .select("chunk_index, page_number, content")
      .eq("item_id", input.vaultItemId)
      .order("chunk_index", { ascending: true });
    if (chunkErr) throw new Error(`Failed to load chunks: ${chunkErr.message}`);
    if (!chunks || chunks.length === 0) {
      throw new Error("Document has no indexed content. Please ensure the file has been ingested.");
    }

    const typedChunks = chunks as ChunkRow[];

    // Pass 1: Structure
    const { map: sectionMap, tokens: t1 } = await pass1Structure(typedChunks, input.anthropicKey);
    totalInput += t1.input;
    totalOutput += t1.output;

    // Optional: Prompt refinement — tailors field descriptions to this
    // lease's specific terminology and section structure.
    if (opts.refinePrompt) {
      const { refinedDescriptions, tokens: tr } = await passRefinePrompt(
        typedChunks,
        sectionMap,
        fields,
        input.anthropicKey,
      );
      totalInput += tr.input;
      totalOutput += tr.output;

      fields = fields.map((f) => ({
        ...f,
        description: refinedDescriptions[f.name] || f.description,
      }));
    }

    // Pass 2: Targeted extraction
    const { fields: extractedFields, context, tokens: t2 } = await pass2Extract(
      typedChunks,
      sectionMap,
      fields,
      input.anthropicKey,
    );
    totalInput += t2.input;
    totalOutput += t2.output;

    // Pass 3: Cross-reference validation
    const { issues, tokens: t3 } = await pass3Validate(extractedFields, context, input.anthropicKey);
    totalInput += t3.input;
    totalOutput += t3.output;

    context.cross_reference_issues = issues;

    // Optional: Web search — enriches context analysis with market data,
    // comparable rents, and tenant credit assessment.
    if (opts.webSearch) {
      const { marketContext, tokens: tw } = await passWebSearch(
        extractedFields,
        input.anthropicKey,
      );
      totalInput += tw.input;
      totalOutput += tw.output;

      if (marketContext) {
        context.market_context = marketContext;
      }
    }

    const elapsedSeconds = (Date.now() - startTime) / 1000;

    // Denormalize tenant_name and expiration_date for efficient
    // querying by the lease expiry cron trigger.
    const tenantField = extractedFields.find(
      (f) => f.name === "Tenant Name" && f.value,
    );
    const expirationField = extractedFields.find(
      (f) => f.name === "Expiration Date" && f.value,
    );
    const denormTenantName = tenantField?.value?.slice(0, 500) ?? null;
    const denormExpDate = parseLeaseDate(expirationField?.value ?? null);

    await supabaseAdmin
      .from("lease_abstracts")
      .update({
        status: "completed",
        fields: extractedFields,
        context_analysis: context,
        model: "claude-sonnet-4-6",
        input_tokens: totalInput,
        output_tokens: totalOutput,
        extraction_seconds: elapsedSeconds,
        tenant_name: denormTenantName,
        expiration_date: denormExpDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", abstractId);

    return {
      id: abstractId,
      vault_item_id: input.vaultItemId,
      status: "completed",
      fields: extractedFields,
      context_analysis: context,
      error_message: null,
      model: "claude-sonnet-4-6",
      input_tokens: totalInput,
      output_tokens: totalOutput,
      extraction_seconds: elapsedSeconds,
    };
  } catch (err: unknown) {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("lease_abstracts")
      .update({
        status: "failed",
        error_message: msg,
        input_tokens: totalInput,
        output_tokens: totalOutput,
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
      error_message: msg,
      model: "",
      input_tokens: totalInput,
      output_tokens: totalOutput,
      extraction_seconds: elapsedSeconds,
    };
  }
}

export { DEFAULT_FIELDS };
