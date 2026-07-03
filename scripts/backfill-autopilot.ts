// scripts/backfill-autopilot.ts
//
// One-time sweep of a workspace's vault through the Autopilot document
// pipeline. New ingests run it automatically (lib/vault/ingest.ts);
// documents that predate the pipeline (or a classifier upgrade) need
// this backfill to appear in the dashboard's Recent Analyses feed.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/backfill-autopilot.ts <workspace_id> [--force]
//
//   --force  re-analyzes documents that already have an analysis row
//            (use after classifier changes to correct old labels)
//
// Classification is heuristic (no LLM) — the sweep is cheap. Rent-roll
// spreadsheets with a stored file also get deterministically
// auto-underwritten.

import { createClient } from "@supabase/supabase-js";
import { runAutopilotForItem } from "../lib/autopilot/analyze";

const CONCURRENCY = 10;

async function main() {
  const [workspaceId, ...flags] = process.argv.slice(2);
  const force = flags.includes("--force");
  if (!workspaceId) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/backfill-autopilot.ts <workspace_id> [--force]");
    process.exit(2);
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE!,
  );

  // Page through every vault item id in the workspace.
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("vault_items")
      .select("id")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    ids.push(...data.map((r) => r.id as string));
    if (data.length < 1000) break;
  }
  console.log(`Backfilling ${ids.length} vault items (force=${force})...`);

  let done = 0;
  let failed = 0;
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        try {
          await runAutopilotForItem(id, { force });
        } catch (err) {
          failed++;
          console.error(`  ${id}: ${err instanceof Error ? err.message : err}`);
        }
        done++;
        if (done % 250 === 0) console.log(`  ${done}/${ids.length}`);
      }
    }),
  );

  const { count } = await sb
    .from("dante_document_analyses")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  console.log(`Done. ${done} processed, ${failed} failed. Workspace now has ${count} analyses.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
