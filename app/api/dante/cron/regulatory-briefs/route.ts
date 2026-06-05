// app/api/dante/cron/regulatory-briefs/route.ts
//
// Phase C3 follow-up — fan-out brief generation.
//
// Runs after the ingest crons (vercel.json schedules this at 07:30
// UTC, ingest at 06:30 + 07:00). Walks active workspaces, picks up
// new in-scope regulatory items since each workspace's last brief,
// and asks Dante (via lib/dante/regulatory/brief.ts) to triage
// them against the workspace's actual book.
//
// Cost discipline:
//   • Only "active" workspaces — at least one user with last_seen_at
//     in the past 14 days. Cuts the noise from abandoned workspaces.
//   • Skip if there are no new in-scope items since last brief.
//   • Per-run cap (MAX_WORKSPACES_PER_RUN) so a quiet day doesn't
//     blow up if every workspace got woken at once. Excess workspaces
//     pick up tomorrow.
//   • One LLM call per workspace, not per item. The brief generator
//     batches all new items into one structured-JSON response.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  generateRegulatoryBrief,
  type RegulatoryItem,
} from "@/lib/dante/regulatory/brief";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_WORKSPACES_PER_RUN = 25;
const ACTIVE_WORKSPACE_DAYS = 14;
const MAX_ITEMS_PER_BRIEF = 12; // keep prompt size bounded

function authOk(request: Request): boolean {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: open
  return bearer === secret;
}

interface RunSummary {
  workspaces_considered: number;
  briefs_generated: number;
  workspaces_skipped_no_items: number;
  errors: Array<{ workspace_id: string; error: string }>;
  details: Array<{
    workspace_id: string;
    items_considered: number;
    items_relevant: number;
    brief_id: string;
  }>;
}

async function listActiveWorkspaces(): Promise<
  Array<{ id: string; industry: string }>
> {
  const cutoff = new Date(
    Date.now() - ACTIVE_WORKSPACE_DAYS * 86400_000,
  ).toISOString();

  // Active = at least one profile with last_seen_at within window.
  // Pull distinct workspace ids by joining manually — Supabase JS
  // doesn't have a clean DISTINCT ON, so we accept a small dup pull
  // and de-dup in memory.
  const { data: rows } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id")
    .gte("last_seen_at", cutoff)
    .not("workspace_id", "is", null)
    .limit(500);

  const ids = new Set<string>();
  for (const r of (rows || []) as Array<{ workspace_id: string }>) {
    if (r.workspace_id) ids.add(r.workspace_id);
  }
  if (ids.size === 0) return [];

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("id, industry")
    .in("id", Array.from(ids));

  return ((ws || []) as Array<{ id: string; industry?: string | null }>).map(
    (w) => ({
      id: w.id,
      industry: "real_estate" as const,
    }),
  );
}

async function fetchNewItemsForWorkspace(
  workspaceId: string,
  industry: string,
): Promise<RegulatoryItem[]> {
  // Cutoff = the workspace's previous brief.covering_until, or 14
  // days ago if there's never been a brief. The first brief picks
  // up two weeks of backlog; subsequent ones only see fresh items.
  const { data: prev } = await supabaseAdmin
    .from("regulatory_briefs")
    .select("covering_until")
    .eq("workspace_id", workspaceId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cutoff =
    (prev as { covering_until?: string | null } | null)?.covering_until ||
    new Date(Date.now() - 14 * 86400_000).toISOString();

  const { data: items } = await supabaseAdmin
    .from("regulatory_corpus_items")
    .select("id, authority, source_kind, source_url, title, body, published_at")
    .contains("industry_scope", [industry])
    .gt("published_at", cutoff)
    .order("published_at", { ascending: false })
    .limit(MAX_ITEMS_PER_BRIEF);

  return (items || []) as RegulatoryItem[];
}

async function handle(request: Request) {
  if (!authOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Optional ?workspace=<uuid> override for one-off targeted runs
  // (manual seed / debugging). Without it, we walk all active
  // workspaces.
  const url = new URL(request.url);
  const targetWorkspace = url.searchParams.get("workspace");

  let workspaces: Array<{ id: string; industry: string }>;
  if (targetWorkspace) {
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, industry")
      .eq("id", targetWorkspace)
      .maybeSingle();
    if (!ws) {
      return NextResponse.json(
        { error: "workspace not found" },
        { status: 404 },
      );
    }
    workspaces = [
      {
        id: (ws as { id: string }).id,
        industry:
          "real_estate" as const,
      },
    ];
  } else {
    workspaces = await listActiveWorkspaces();
  }

  const summary: RunSummary = {
    workspaces_considered: workspaces.length,
    briefs_generated: 0,
    workspaces_skipped_no_items: 0,
    errors: [],
    details: [],
  };

  const slice = workspaces.slice(0, MAX_WORKSPACES_PER_RUN);

  for (const w of slice) {
    try {
      const items = await fetchNewItemsForWorkspace(w.id, w.industry);
      if (items.length === 0) {
        summary.workspaces_skipped_no_items += 1;
        continue;
      }

      const brief = await generateRegulatoryBrief(w.id, items);

      // Persist the brief. covering_since is the previous brief's
      // covering_until (we re-derive it here so the persist is
      // self-contained); covering_until is "now".
      const now = new Date().toISOString();
      const { data: prev } = await supabaseAdmin
        .from("regulatory_briefs")
        .select("covering_until")
        .eq("workspace_id", w.id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const coveringSince =
        (prev as { covering_until?: string | null } | null)?.covering_until ||
        null;

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("regulatory_briefs")
        .insert({
          workspace_id: w.id,
          covering_since: coveringSince,
          covering_until: now,
          items_considered: brief.items_considered,
          items_relevant: brief.items_relevant,
          findings: brief.findings,
          model: brief.model,
          trigger_kind: targetWorkspace ? "manual" : "auto",
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);

      summary.briefs_generated += 1;
      summary.details.push({
        workspace_id: w.id,
        items_considered: brief.items_considered,
        items_relevant: brief.items_relevant,
        brief_id: (inserted as { id: string }).id,
      });
    } catch (err) {
      summary.errors.push({
        workspace_id: w.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
