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

// ── meeting_prep_ready ───────────────────────────────────────────
//
// Surfaces upcoming calendar events (next 24h) so the advisor sees
// a "Meeting with X tomorrow at 10am" card on their morning
// briefing. Doesn't generate a brief inline (that's costly + can
// happen on click); the notice is the prompt to prep, with the
// target_id pointing back at the contact for one-click context.

const computeMeetingPrepReady: Computer = async ({ workspaceId, vertical, now }) => {
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const startWindow = now.toISOString();
  const dateBucket = now.toISOString().slice(0, 10);

  const { data: events } = await supabaseAdmin
    .from("calendar_events")
    .select("id, contact_id, summary, start_at, location")
    .eq("workspace_id", workspaceId)
    .gte("start_at", startWindow)
    .lte("start_at", horizon)
    .neq("status", "cancelled")
    .order("start_at", { ascending: true })
    .limit(8);

  if (!events || events.length === 0) return [];

  // Pull contact names in one go for nicer copy.
  const contactIds = (events as { contact_id: string | null }[])
    .map((e) => e.contact_id)
    .filter((id): id is string => Boolean(id));
  const nameById = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, name")
      .in("id", contactIds);
    for (const c of (contacts || []) as { id: string; name: string | null }[]) {
      if (c.name) nameById.set(c.id, c.name);
    }
  }

  const subject = vertical === "real_estate" ? "Showing" : "Meeting";

  return (events as Array<{ id: string; contact_id: string | null; summary: string | null; start_at: string; location: string | null }>).map((e) => {
    const start = new Date(e.start_at);
    const timeLabel = start.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const who = (e.contact_id && nameById.get(e.contact_id)) || e.summary || "Untitled";
    const locationFragment = e.location ? ` — ${e.location}` : "";
    return {
      workspace_id: workspaceId,
      vertical,
      kind: "meeting_prep_ready",
      severity: "info" as const,
      title: `${subject} with ${who} · ${timeLabel}`,
      body: `Click to open the contact and pull recent notes${locationFragment}.`,
      target_kind: e.contact_id ? "contact" : null,
      target_id: e.contact_id ?? null,
      citations: [],
      dedupe_key: `meeting_prep_ready:${e.id}:${dateBucket}`,
      // 24h after start_at it's no longer prep — drop the card.
      expires_at: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };
  });
};

// ── contradiction_found ──────────────────────────────────────────
//
// Runs inconsistency.detect over recently-uploaded vault items
// against their project peers. This is the Harvey-disclaimed
// capability: when a new IPS lands, Drift compares it against the
// prior version and flags the conflicts. High WOW factor; also the
// most LLM-expensive computer in the registry, so it's bounded by
// caps (20 items × 5 peers × Sonnet) and only runs on docs from the
// last 24h.

import { detectInconsistencies } from "@/lib/dante/tools/inconsistency-detect";

const computeContradictionFound: Computer = async ({ workspaceId, vertical, now }) => {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentItems } = await supabaseAdmin
    .from("vault_items")
    .select("id, project_id, title, created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", since)
    .not("project_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!recentItems || recentItems.length === 0) return [];

  const rows: NoticedRow[] = [];
  for (const item of recentItems as Array<{ id: string; project_id: string; title: string }>) {
    const { data: peers } = await supabaseAdmin
      .from("vault_items")
      .select("id, title")
      .eq("workspace_id", workspaceId)
      .eq("project_id", item.project_id)
      .neq("id", item.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!peers || peers.length === 0) continue;

    const docIds = [item.id, ...(peers as { id: string }[]).map((p) => p.id)];
    let result;
    try {
      result = await detectInconsistencies({
        workspaceId,
        doc_ids: docIds,
        question:
          "Identify material contradictions across these documents — conflicting terms, dates that don't reconcile, or commitments that are inconsistent. Skip wording differences without substantive impact.",
      });
    } catch (e) {
      console.warn(`[contradiction_found] detect failed for ${item.id}:`, e instanceof Error ? e.message : e);
      continue;
    }

    for (const finding of result.findings) {
      if (finding.severity === "low") continue;

      const otherTitles = finding.positions
        .filter((p) => p.doc_id !== item.id)
        .map((p) => p.doc_title)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");

      rows.push({
        workspace_id: workspaceId,
        vertical,
        kind: "contradiction_found",
        severity: finding.severity === "high" ? "urgent" : "attention",
        title: `Conflict in ${item.title}`,
        body: otherTitles
          ? `${finding.description} (vs ${otherTitles})`
          : finding.description,
        target_kind: "vault_item",
        target_id: item.id,
        citations: finding.positions.map((p) => ({
          source_kind: "vault_item",
          source_id: p.doc_id,
          source_title: p.doc_title,
          quote: p.quote,
        })),
        // Severity-scoped dedupe so a doc with both a high and a
        // medium contradiction surfaces both, not one or the other.
        dedupe_key: `contradiction_found:${item.id}:${finding.severity}`,
        expires_at: new Date(now.getTime() + 14 * 86400000).toISOString(),
      });
    }
  }
  return rows;
};

// ── Registry ─────────────────────────────────────────────────────

export const ALL_COMPUTERS: Computer[] = [
  computeClientStale,
  computeMeetingPrepReady,
  computeContradictionFound,
];

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
