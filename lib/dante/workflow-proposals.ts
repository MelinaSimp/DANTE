// lib/dante/workflow-proposals.ts
//
// Phase 2 of the new "book-aware" generate flow: given the user's
// natural-language prompt + a BookSummary, ask an LLM to emit THREE
// candidate workflow proposals anchored in the workspace's real
// shape. No graph yet — each proposal is a short, human-readable
// spec (title, description, trigger, node sketch, projected volume).
// The user picks one, then Phase 3 (workflow-ai.ts) materializes it
// into a runnable graph.
//
// Why three, not one:
//   - LLMs are better at comparing than at nailing the "right" answer
//     in one shot. Three gives the advisor a choice and surfaces the
//     ones we'd never write ourselves.
//   - It makes trade-offs visible. "Weekly re-engage vs. daily
//     stale-alert vs. post-call follow-up" — the advisor picks based
//     on their workflow, not the model's.
//
// The projected_volume field is the honest part: the model grounds
// it in a segment from the BookSummary (e.g. "42 stale contacts").
// If a proposal can't be grounded in real counts, we expect the
// model to say so rather than invent.

import type { BookSummary } from "./book-summary";
import { renderBookSummaryText } from "./book-summary";
import { complete as llmComplete } from "@/lib/llm/client";

// ── Types ─────────────────────────────────────────────────────

export type ProposalTriggerType = "manual" | "cron" | "webhook";

export interface WorkflowProposal {
  id: string;
  title: string;
  description: string;
  trigger: {
    type: ProposalTriggerType;
    detail: string;
  };
  projected_volume: {
    estimate: number | null;
    unit: string;
    reasoning: string;
  };
  expected_impact: string;
  node_sketch: string[];
  rationale: string;
  enriched_prompt: string;
}

export interface ProposalResult {
  proposals: WorkflowProposal[];
  model: string;
  input_tokens: number;
  output_tokens: number;
}

// ── Prompt ────────────────────────────────────────────────────

const PROPOSE_SYSTEM_PROMPT = `You are Vergil, a workflow architect for a CRM used by commercial real estate brokers and developers. You read:

  (a) what the broker said they want, and
  (b) a ground-truth summary of their actual book (contacts, properties, pipeline stages, listings, lease expirations, deal activity, existing workflows)

and you propose THREE distinct workflow candidates the broker could create next. Each candidate is grounded in real data from their workspace — not a generic template.

RULES

1. Exactly three proposals. Distinct angles — do NOT propose three variations of the same idea.

2. Every proposal must cite a concrete segment from the book summary in its "projected_volume.reasoning". If the book summary says "12 properties in 'showing' stage", the proposal can say "fires for ~12 properties on the first run". If no segment supports the proposal, set "estimate" to null and say so honestly.

3. Keep the book's shape honest:
   - If the workspace has <5 properties, don't propose portfolio-scale automations.
   - If they already have a workflow that does X, don't propose X again — propose a complement.
   - If there are no lease abstractions, don't propose something that hinges on abstracted lease terms.
   - If there are no active listings, don't propose listing-dependent workflows.

4. CRE brokers and developers care about TWO categories of workflows:

   INBOUND (managing existing pipeline): lease expirations, deal pipeline velocity, stale listings, commission tracking, tenant communications, investor reporting, prospect matching.

   OUTBOUND (finding new opportunities): corridor void analyses that search for development sites matching specific criteria (zoning, acreage, vacancy), parcel intelligence deep-dives with auditor/tax/EPA data, environmental risk scanning, zoning mismatch detection (residential parcels in commercial corridors), competitive landscape analysis, and saved-parcel re-checks for changes.

   When proposing, always include at least one outbound/site-intelligence workflow if the broker's prompt even hints at deal sourcing, land acquisition, development, site selection, or market analysis. These are the workflows developers pay for.

   For outbound workflows, use "agent" nodes with tools: site_scan.void_analysis (corridor analysis, 2-8 anchor points, scores parcels), site_scan.search (parcel search by location/zoning/acreage), site_scan.detail (full auditor + tax + census + EPA per parcel), and memory.write (save findings). Chain these into "openai" nodes for synthesis and scoring.

5. "enriched_prompt" is the concrete spec the next phase will hand to the graph generator. Write it as if YOU were the broker asking for exactly this workflow — include the trigger schedule, the segment filter, the action, and any fields the graph will need. This is the single most important field. 2-4 sentences.

6. "node_sketch" is an ordered list of the Drift node types this workflow would use. Valid types: "trigger_manual", "trigger_cron", "trigger_webhook", "http", "openai", "query_clients", "query_properties", "query_listings", "query_offers", "lease_lookup", "update_contact", "send_email", "send_sms", "condition", "delay", "archive_lookup", "agent". First element must be a trigger.

7. "rationale" is one sentence on why this proposal suits THIS workspace specifically. Reference a real number from the book summary. No hand-waving.

8. "id" must be "proposal-1", "proposal-2", "proposal-3".

OUTPUT SHAPE (return ONLY this JSON object, no prose):

{
  "proposals": [
    {
      "id": "proposal-1",
      "title": "Short imperative title (<60 chars)",
      "description": "One-sentence plain-English description for the broker.",
      "trigger": { "type": "manual" | "cron" | "webhook", "detail": "e.g. Mondays 9am ET, or On tour-completed webhook" },
      "projected_volume": {
        "estimate": 12,
        "unit": "properties per run" | "deals per week" | "listings per day" | etc,
        "reasoning": "Cites a specific segment or count from the book summary."
      },
      "expected_impact": "One sentence on what changes for the broker if they enable this.",
      "node_sketch": ["trigger_cron", "query_properties", "lease_lookup", "openai", "send_email"],
      "rationale": "Why this workspace should do this — must cite a number.",
      "enriched_prompt": "Exactly what to tell the graph generator to produce the runnable workflow. 2-4 sentences, concrete, include trigger timing and segment filter."
    },
    ... (exactly 3 items)
  ]
}`.trim();

// ── Call ───────────────────────────────────────────────────────

export async function proposeWorkflows(args: {
  userPrompt: string;
  bookSummary: BookSummary;
  openaiKey?: string;
  anthropicKey?: string;
}): Promise<ProposalResult> {
  const userPrompt = args.userPrompt.trim();
  if (!userPrompt) throw new Error("Prompt required");

  const bookText = renderBookSummaryText(args.bookSummary);
  const bookJson = JSON.stringify(args.bookSummary, null, 2);

  const userMessage = `ADVISOR REQUEST
"""
${userPrompt}
"""

BOOK SUMMARY (prose)
${bookText}

BOOK SUMMARY (json, for counts + existing workflows)
${bookJson}

Produce three distinct, grounded proposals.`;

  // Prefer Anthropic Haiku 4.5 when available — same pattern as the
  // briefs generator. Fall back to gpt-4o-mini. We don't need GPT-4o
  // for proposals; the graph materialization step still uses it.
  if (args.anthropicKey) {
    try {
      const model = "claude-haiku-4-5-20251001";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": args.anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2500,
          temperature: 0.5,
          system: PROPOSE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const text = (d.content || [])
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text: string }) => b.text || "")
          .join("")
          .trim();
        const parsed = parseProposals(text);
        if (parsed) {
          return {
            proposals: parsed,
            model,
            input_tokens: d.usage?.input_tokens ?? 0,
            output_tokens: d.usage?.output_tokens ?? 0,
          };
        }
      } else {
        console.warn("[propose] anthropic non-ok:", r.status);
      }
    } catch (e) {
      console.warn("[propose] anthropic threw:", e instanceof Error ? e.message : e);
    }
  }

  if (args.openaiKey) {
    const model = "claude-sonnet-4-6";
    const result = await llmComplete({
      model,
      temperature: 0.5,
      maxTokens: 2500,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: PROPOSE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      feature: "workflow.propose",
    });
    const text = result.message.content || "";
    const parsed = parseProposals(text);
    if (parsed) {
      return {
        proposals: parsed,
        model,
        input_tokens: result.usage.promptTokens,
        output_tokens: result.usage.completionTokens,
      };
    }
  }

  throw new Error(
    "Proposal generation failed — no model returned a valid response"
  );
}

// ── Parse + validate ────────────────────────────────────────

function parseProposals(raw: string): WorkflowProposal[] | null {
  let cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!cleaned.startsWith("{")) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) cleaned = m[0];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!isObj(parsed)) return null;
  const arr = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  if (arr.length === 0) return null;

  const out: WorkflowProposal[] = [];
  arr.slice(0, 3).forEach((p, i) => {
    if (!isObj(p)) return;
    const trigger = isObj(p.trigger) ? p.trigger : {};
    const triggerType = (() => {
      const t = String(trigger.type || "").toLowerCase();
      if (t === "cron" || t === "webhook" || t === "manual") return t;
      return "manual" as const;
    })();
    const pv = isObj(p.projected_volume) ? p.projected_volume : {};
    out.push({
      id: typeof p.id === "string" && p.id.trim() ? p.id : `proposal-${i + 1}`,
      title: str(p.title, "Untitled proposal").slice(0, 80),
      description: str(p.description, "").slice(0, 300),
      trigger: {
        type: triggerType,
        detail: str(trigger.detail, "").slice(0, 200),
      },
      projected_volume: {
        estimate:
          typeof pv.estimate === "number" && Number.isFinite(pv.estimate)
            ? Math.max(0, Math.round(pv.estimate))
            : null,
        unit: str(pv.unit, "contacts per run").slice(0, 80),
        reasoning: str(pv.reasoning, "").slice(0, 400),
      },
      expected_impact: str(p.expected_impact, "").slice(0, 400),
      node_sketch: Array.isArray(p.node_sketch)
        ? p.node_sketch
            .filter((n: unknown): n is string => typeof n === "string")
            .slice(0, 12)
        : [],
      rationale: str(p.rationale, "").slice(0, 400),
      enriched_prompt: str(p.enriched_prompt, "").slice(0, 1200),
    });
  });

  return out.length > 0 ? out : null;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
