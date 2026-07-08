// lib/industry/terminology.ts
//
// Domain terminology dictionaries.
//
// Two layers:
//   1. Built-in dictionary (this file). A small, platform-neutral set
//      of proper-noun and acronym terms the agent should recognize
//      and define inline if it's about to use them.
//   2. Workspace-specific overrides (workspace_terminology table).
//      Teams add their own product names, internal acronyms, and
//      jargon — augments the built-in.
//
// Dictionary entries get inlined into the system prompt when the
// query contains them; this lifts retrieval recall on exact-match
// queries ("show me record 12345" → recognize "record" + the number).

import type { Industry } from "./config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface TerminologyEntry {
  term: string;
  definition?: string;
  scope?: string;
}

const BUILTIN_TERMS: TerminologyEntry[] = [
  { term: "agent", scope: "system", definition: "An AI worker that follows instructions, uses tools, and cites its sources." },
  { term: "workflow", scope: "system", definition: "A multi-step automation that chains agents, tools, and triggers." },
  { term: "vault", scope: "system", definition: "The workspace document store the assistant searches and cites." },
  { term: "citation", scope: "system", definition: "A reference back to the exact source (document, page, or URL) behind an answer." },
  { term: "MCP", scope: "system", definition: "Model Context Protocol — the standard for connecting external tools and data to an agent." },
  { term: "trigger", scope: "workflow", definition: "The event that starts a workflow (schedule, webhook, or inbound message)." },
  { term: "skill", scope: "system", definition: "A packaged, reusable capability an agent can run (e.g. draft an email, summarize a document)." },
  { term: "SLA", scope: "metric", definition: "Service-Level Agreement — a committed response or resolution time." },
  { term: "SSO", scope: "system", definition: "Single Sign-On — logging in through an identity provider." },
  { term: "webhook", scope: "system", definition: "An HTTP callback that lets an external service push events into a workflow." },
];

const BUILTIN: Record<Industry, TerminologyEntry[]> = {
  real_estate: BUILTIN_TERMS,
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
