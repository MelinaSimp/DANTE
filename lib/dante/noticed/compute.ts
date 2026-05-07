// lib/dante/noticed/compute.ts
//
// Per-kind notice computers. Each function takes a workspace and
// returns rows that should be upserted into `dante_noticed`. The
// cron route iterates workspaces, calls each computer, and bulk-
// upserts via the dedupe_key unique index.
//
// New notice kinds plug in by adding a function here + listing it
// in `ALL_COMPUTERS` at the bottom. Keep computers fast, pure-SQL
// where possible, and cite their source via the `citations` field
// so the SourceViewer click-through works exactly like in chat.

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Industry } from "@/lib/industry/config";

// ── Shared types ─────────────────────────────────────────────────

export interface NoticedRow {
  workspace_id: string;
  vertical: Industry;
  kind: string;
  severity: "info" | "attention" | "urgent";
  title: string;
  body: string;
  target_kind: string | null;
  target_id: string | null;
  citations: unknown[];
  dedupe_key: string;
  expires_at: string; // iso timestamptz
}

export interface ComputerContext {
  workspaceId: string;
  vertical: Industry;
  /** Run timestamp — every row produced by this run uses the same `now`
   *  for stable dedupe keys (e.g. bucketing by ISO date).
   */
  now: Date;
}

type Computer = (ctx: ComputerContext) => Promise<NoticedRow[]>;

// ── client_stale ─────────────────────────────────────────────────
//
// Contacts with no notes in 90+ days. This complements the
// dashboard's existing `flagged` list (60d, capped at 5) with a
// stricter, persistent surface — once a relationship is 90 days
// quiet it stays on the morning briefing until the advisor acts.
// Mirrored across both verticals; a stale buyer is as load-bearing
// as a stale RIA client.

const STALE_DAYS = 90;
const STALE_LIMIT = 8;

const computeClientStale: Computer = async ({ workspaceId, vertical, now }) => {
  const cutoffIso = new Date(now.getTime() - STALE_DAYS * 86400_000).toISOString();
  const dateBucket = now.toISOString().slice(0, 10);

  // Pull all contacts and the most recent note per contact in one
  // round-trip each. Filtering "no note since cutoff" client-side
  // is fine — advisor workspaces have <2k contacts in practice.
  const [{ data: contacts }, { data: recentNotes }] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id, name, created_at")
      .eq("workspace_id", workspaceId),
    supabaseAdmin
      .from("notes")
      .select("contact_id, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", cutoffIso),
  ]);

  if (!contacts || contacts.length === 0) return [];

  const touched = new Set(
    (recentNotes || [])
      .map((n: { contact_id: string | null }) => n.contact_id)
      .filter((id): id is string => Boolean(id)),
  );

  // Skip contacts younger than the cutoff — they haven't had a chance
  // to go stale yet.
  const stale = contacts
    .filter((c: { id: string; created_at: string }) => {
      if (touched.has(c.id)) return false;
      const created = new Date(c.created_at).getTime();
      return now.getTime() - created > STALE_DAYS * 86400_000;
    })
    .slice(0, STALE_LIMIT);

  const role = vertical === "real_estate" ? "buyer / seller" : "client";
  const noun = vertical === "real_estate" ? "Buyer" : "Client";

  return stale.map((c: { id: string; name: string | null }) => ({
    workspace_id: workspaceId,
    vertical,
    kind: "client_stale",
    severity: "attention" as const,
    title: `${noun} quiet for 90+ days: ${c.name || "Unnamed"}`,
    body: `No call notes, emails, or meetings logged with this ${role} in over 90 days. A short check-in keeps the relationship warm.`,
    target_kind: "contact",
    target_id: c.id,
    citations: [],
    dedupe_key: `client_stale:${c.id}:${dateBucket}`,
    // Stale-client cards expire after 7 days — if the advisor
    // hasn't acted, we resurface fresh on the next bucket.
    expires_at: new Date(now.getTime() + 7 * 86400_000).toISOString(),
  }));
};

// ── Registry ─────────────────────────────────────────────────────

export const ALL_COMPUTERS: Computer[] = [computeClientStale];

// ── Bulk upsert ──────────────────────────────────────────────────

export async function upsertNoticed(rows: NoticedRow[]) {
  if (rows.length === 0) return { inserted: 0 };
  // The (workspace_id, dedupe_key) unique index on unhandled rows
  // means a re-run today is a no-op. We use ON CONFLICT DO NOTHING
  // semantics by ignoring 23505 violations.
  const { error, count } = await supabaseAdmin
    .from("dante_noticed")
    .upsert(rows, { onConflict: "workspace_id,dedupe_key", ignoreDuplicates: true, count: "exact" });
  if (error) {
    console.error("[noticed] upsert failed:", error);
    return { inserted: 0, error: error.message };
  }
  return { inserted: count ?? rows.length };
}
