// app/api/dante/cron/notices/route.ts
//
// Daily cron that computes proactive notices into `dante_noticed`.
// Each workspace gets every kind run against it; rows are upserted
// idempotently via the (workspace_id, dedupe_key) unique index, so
// running twice in the same day is a no-op.
//
// Auth: Authorization: Bearer <CRON_SECRET>, same pattern as the
// rest of /api/dante/cron/*. Vercel Cron sets the header from the
// project env.
//
// The first kind shipped is `client_stale` (90d quiet contact);
// more kinds plug in via lib/dante/noticed/compute.ts ALL_COMPUTERS.

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ALL_COMPUTERS,
  upsertNoticed,
  type NoticedRow,
} from "@/lib/dante/noticed/compute";
import { runNoticerAgent } from "@/lib/dante/noticed/agent";
import type { Industry } from "@/lib/industry/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface WorkspaceRow {
  id: string;
  industry: string | null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  const { data: workspaces, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, industry");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  let totalRows = 0;
  let totalInserted = 0;
  let totalSkippedNoVertical = 0;
  const perKind: Record<string, number> = {};
  const noticerSummary: Array<{ workspace_id: string; reason: string; emitted: number }> = [];

  for (const ws of (workspaces || []) as WorkspaceRow[]) {
    if (ws.industry !== "real_estate") {
      totalSkippedNoVertical += 1;
      continue;
    }
    const vertical = ws.industry as Industry;
    const ctx = { workspaceId: ws.id, vertical, now };

    const rows: NoticedRow[] = [];
    for (const compute of ALL_COMPUTERS) {
      try {
        const out = await compute(ctx);
        rows.push(...out);
        for (const r of out) perKind[r.kind] = (perKind[r.kind] || 0) + 1;
      } catch (e) {
        console.error(
          `[notices] computer failed for workspace ${ws.id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    // Autonomous noticer agent — runs after the deterministic
    // computers. Cheap kinds run first so the agent has access to
    // today's fresh notices via its existing-notices context block,
    // and an LLM failure here can't take down the rest of the cron.
    try {
      const agentResult = await runNoticerAgent(ws.id, vertical, now);
      rows.push(...agentResult.rows);
      for (const r of agentResult.rows)
        perKind[r.kind] = (perKind[r.kind] || 0) + 1;
      noticerSummary.push({
        workspace_id: ws.id,
        reason: agentResult.reason,
        emitted: agentResult.rows.length,
      });
    } catch (e) {
      console.error(
        `[notices] noticer agent failed for workspace ${ws.id}:`,
        e instanceof Error ? e.message : e,
      );
      noticerSummary.push({
        workspace_id: ws.id,
        reason: `error: ${e instanceof Error ? e.message : String(e)}`,
        emitted: 0,
      });
    }

    totalRows += rows.length;

    if (!dryRun && rows.length > 0) {
      const { inserted } = await upsertNoticed(rows);
      totalInserted += inserted;
    }
  }

  // Garbage-collect expired rows so the dashboard query stays tight.
  // Cheap; the partial index on (workspace_id, severity, created_at)
  // doesn't include handled/expired rows anyway, but keeping the
  // table thin matters for future computers that read prior notices.
  if (!dryRun) {
    await supabaseAdmin
      .from("dante_noticed")
      .delete()
      .lt("expires_at", now.toISOString());
  }

  return NextResponse.json({
    workspaces_checked: (workspaces || []).length,
    workspaces_skipped_no_vertical: totalSkippedNoVertical,
    rows_computed: totalRows,
    rows_inserted: totalInserted,
    per_kind: perKind,
    noticer_agent: noticerSummary,
    dry_run: dryRun,
  });
}
