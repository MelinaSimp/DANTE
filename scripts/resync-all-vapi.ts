// scripts/resync-all-vapi.ts
//
// One-shot maintenance: re-pushes every deployed VAPI assistant across
// every workspace using the same code path the in-app
// /api/agents/resync-voice endpoint uses. Needed after we add new tools
// to lib/vapi/sync.ts (VAPI caches per-assistant tool config — existing
// assistants keep the old shape until a sync pushes the new one).
//
// Run: npx tsx -r dotenv/config scripts/resync-all-vapi.ts dotenv_config_path=.env.local
// Or:  set -a && source .env.local && set +a && npx tsx scripts/resync-all-vapi.ts

import { createClient } from "@supabase/supabase-js";
import { syncAgentToVapi } from "../lib/vapi/sync";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!process.env.VAPI_API_KEY) {
    console.error("Missing VAPI_API_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, name, workspace_id, vapi_assistant_id, status, voice_provider")
    .eq("voice_provider", "vapi")
    .eq("status", "deployed");

  if (error) {
    console.error("Failed to query agents:", error);
    process.exit(1);
  }

  console.log(`Found ${agents?.length ?? 0} deployed VAPI agents.\n`);

  const ok: string[] = [];
  const fail: { id: string; name: string; err: string }[] = [];

  for (const a of agents ?? []) {
    process.stdout.write(`  ${a.name} (${a.id}) → `);
    try {
      const { assistantId } = await syncAgentToVapi(a.id);
      console.log(`OK  assistant=${assistantId}`);
      ok.push(a.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL ${msg}`);
      fail.push({ id: a.id, name: a.name, err: msg });
    }
  }

  console.log(`\nResynced ${ok.length}/${agents?.length ?? 0}.`);
  if (fail.length) {
    console.log(`Failures:`);
    for (const f of fail) console.log(`  - ${f.name} (${f.id}): ${f.err}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
