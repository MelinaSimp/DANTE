// lib/industry/terminology.ts
//
// Phase 6 W6.12 — domain terminology dictionaries.
//
// Two layers:
//   1. Built-in per-vertical dictionary (this file). Curated list
//      of proper-noun and acronym terms the agent should recognize
//      and define inline if it's about to use them.
//   2. Workspace-specific overrides (workspace_terminology table).
//      Firms add their own custodian names, MLS codes, internal
//      product names — augments the built-in.
//
// Dictionary entries get inlined into the system prompt when the
// query contains them; this lifts retrieval recall on exact-match
// queries ("show me account 12345" → recognize "account" + the
// number; "Schwab" → know it's a custodian, not a noise word).

import type { Industry } from "./config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface TerminologyEntry {
  term: string;
  definition?: string;
  scope?: string;
}

const ADVISOR_TERMS: TerminologyEntry[] = [
  { term: "Schwab", scope: "custodian", definition: "Charles Schwab — major custodian for RIAs." },
  { term: "Fidelity", scope: "custodian", definition: "Fidelity — major custodian for RIAs." },
  { term: "Altruist", scope: "custodian", definition: "Altruist — newer-generation RIA custodian." },
  { term: "Pershing", scope: "custodian", definition: "Pershing (BNY Mellon) — institutional custodian." },
  { term: "IPS", scope: "doc_kind", definition: "Investment Policy Statement — defines client's portfolio rules." },
  { term: "Form ADV", scope: "doc_kind", definition: "SEC-required RIA registration document." },
  { term: "RMD", scope: "compliance", definition: "Required Minimum Distribution — IRS rule on retirement accounts." },
  { term: "AUM", scope: "metric", definition: "Assets Under Management." },
  { term: "QBI", scope: "tax", definition: "Qualified Business Income deduction." },
  { term: "Roth", scope: "account_type", definition: "Roth IRA / Roth 401(k) — post-tax retirement account." },
  { term: "TLH", scope: "strategy", definition: "Tax-Loss Harvesting — selling at a loss to offset gains." },
  { term: "rebalance", scope: "strategy", definition: "Adjust portfolio to target allocation." },
  { term: "Black Diamond", scope: "platform", definition: "Black Diamond Wealth Platform (SS&C) — portfolio reporting." },
  { term: "Orion", scope: "platform", definition: "Orion Advisor Tech — portfolio + reporting platform." },
  { term: "Tamarac", scope: "platform", definition: "Tamarac (Envestnet) — portfolio management platform." },
  { term: "529", scope: "account_type", definition: "529 plan — tax-advantaged education savings account." },
];

const REALTOR_TERMS: TerminologyEntry[] = [
  { term: "MLS", scope: "system", definition: "Multiple Listing Service — broker-shared listing database." },
  { term: "BBA", scope: "doc_kind", definition: "Buyer-Broker Agreement." },
  { term: "P&S", scope: "doc_kind", definition: "Purchase & Sale Agreement." },
  { term: "DOM", scope: "metric", definition: "Days on Market — how long a listing has been active." },
  { term: "GCI", scope: "metric", definition: "Gross Commission Income." },
  { term: "earnest money", scope: "transaction", definition: "Buyer's good-faith deposit." },
  { term: "contingency", scope: "transaction", definition: "Purchase condition (financing, inspection, appraisal, etc.)." },
  { term: "HOA", scope: "doc_kind", definition: "Homeowners Association — covenants and dues." },
  { term: "title", scope: "transaction", definition: "Legal document evidencing property ownership." },
  { term: "escrow", scope: "transaction", definition: "Third-party-held funds during transaction." },
  { term: "comp", scope: "metric", definition: "Comparable property used for pricing analysis." },
  { term: "lockbox", scope: "system", definition: "Showing-time access device on a listing." },
  { term: "pre-approval", scope: "financing", definition: "Lender's preliminary commitment to fund a buyer." },
  { term: "dual agency", scope: "compliance", definition: "Same agent represents both buyer and seller; consent required." },
  { term: "exclusive", scope: "doc_kind", definition: "Exclusive right-to-sell listing agreement." },
  { term: "RESO", scope: "system", definition: "Real Estate Standards Organization — MLS data API standard." },
];

const BUILTIN: Record<Industry, TerminologyEntry[]> = {
  financial_advisor: ADVISOR_TERMS,
  real_estate: REALTOR_TERMS,
};

/**
 * Returns the merged terminology list for a workspace: built-in
 * vertical entries + workspace-specific overrides. Entries with
 * the same `term` collapse with workspace overrides winning.
 */
export async function getTerminology(
  workspaceId: string,
  industry: Industry,
): Promise<TerminologyEntry[]> {
  const builtin = BUILTIN[industry] ?? [];
  const { data: rows } = await supabaseAdmin
    .from("workspace_terminology")
    .select("term, definition, scope")
    .eq("workspace_id", workspaceId);

  const map = new Map<string, TerminologyEntry>();
  for (const e of builtin) map.set(e.term.toLowerCase(), e);
  for (const r of (rows || []) as TerminologyEntry[]) {
    map.set(r.term.toLowerCase(), r);
  }
  return Array.from(map.values());
}

/**
 * Given a user query, return the subset of terminology entries
 * whose `term` appears in the query (case-insensitive). Used by
 * the agent loop to inline relevant definitions in the system
 * prompt rather than dumping the full dictionary every turn.
 */
export function relevantTerms(
  query: string,
  dictionary: TerminologyEntry[],
): TerminologyEntry[] {
  const q = query.toLowerCase();
  return dictionary.filter((e) => q.includes(e.term.toLowerCase()));
}

/** Render a small markdown block the system prompt can include. */
export function formatTermsForPrompt(terms: TerminologyEntry[]): string {
  if (terms.length === 0) return "";
  const lines = terms.map((t) => `- **${t.term}**${t.definition ? ` — ${t.definition}` : ""}`);
  return `\nDomain terms in this query:\n${lines.join("\n")}`;
}
