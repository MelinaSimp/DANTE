// scripts/check-schema.ts
//
// Phase 4 W4.2 — schema introspection gate.
//
// Four production bugs in our last test session were all the same
// shape: code assumed a table or column existed, the actual live
// schema differed, the bug shipped. The fix isn't more careful
// reading; it's a runtime introspection check that fails the
// build when assumptions diverge from reality.
//
// MANIFEST below lists every (table, columns[]) the production
// code path touches. The script connects to Supabase, queries
// information_schema, and verifies each table+column exists.
// Mismatches produce a clear actionable error.
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/check-schema.ts
//
// CI: `npm run check:schema`. Wired into the pre-deploy gate.
//
// Adding a new table/column = update MANIFEST. PRs that touch
// supabase/migrations/* should also update this manifest in the
// same PR — a CODEOWNERS rule could enforce.

import { createClient } from "@supabase/supabase-js";

interface TableSpec {
  table: string;
  /** Columns the code reads or writes. Subset of the actual
   *  table — we don't require the manifest to list every column. */
  columns: string[];
}

const MANIFEST: TableSpec[] = [
  // ── Core tenancy ──
  {
    table: "profiles",
    columns: ["id", "workspace_id", "role", "is_superadmin", "full_name"],
  },
  {
    table: "workspaces",
    columns: ["id", "industry", "plan_tier", "plan_seats", "default_model"],
  },
  {
    table: "contacts",
    columns: ["id", "workspace_id", "name", "email", "phone", "deleted_at"],
  },
  // ── Vault (canonical archive store) ──
  {
    table: "vault_items",
    columns: ["id", "workspace_id", "kind", "title", "content"],
  },
  {
    table: "vault_item_chunks",
    columns: ["id", "item_id", "workspace_id", "page_number", "content", "embedding"],
  },
  // ── Memory ──
  {
    table: "dante_memory",
    columns: [
      "id",
      "workspace_id",
      "kind",
      "content",
      "subject_contact_id",
      "source_kind",
      "source_id",
      "embedding",
      "review_status",
      "metadata",
      "deleted_at",
    ],
  },
  // ── Chat persistence ──
  {
    table: "dante_chats",
    columns: ["id", "workspace_id", "user_id", "title"],
  },
  {
    table: "dante_chat_messages",
    columns: ["id", "chat_id", "role", "content", "trace", "citation_report", "grounding_score", "prompt_version"],
  },
  // ── Review queues ──
  {
    table: "outbound_review_queue",
    columns: ["id", "workspace_id", "kind", "payload", "review_status", "contact_id"],
  },
  // ── Compliance ──
  {
    table: "audit_logs",
    columns: ["id", "workspace_id", "user_id", "action", "resource_type", "resource_id", "metadata", "timestamp"],
  },
  {
    table: "workspace_retention_policies",
    columns: ["workspace_id", "contacts_retention_days", "hard_delete_enabled"],
  },
  {
    table: "retention_worker_runs",
    columns: ["id", "started_at", "finished_at", "workspaces_touched", "errors"],
  },
  // ── Billing ──
  {
    table: "usage_events",
    columns: ["id", "workspace_id", "kind", "quantity", "stripe_reported", "occurred_at"],
  },
  {
    table: "workspace_billing_meters",
    columns: ["workspace_id", "kind", "stripe_subscription_item_id"],
  },
  // ── Rate limiting ──
  {
    table: "rate_limit_buckets",
    columns: ["workspace_id", "bucket", "tokens", "capacity", "refill_per_min"],
  },
  // ── MCP ──
  {
    table: "mcp_servers",
    columns: ["id", "workspace_id", "name", "url", "enabled", "approval_status", "redaction_policy"],
  },
  // ── Unread tracking ──
  {
    table: "user_read_markers",
    columns: ["user_id", "workspace_id", "resource_type", "resource_id", "read_at"],
  },
  // ── Realtor schema parity ──
  { table: "contact_extensions", columns: ["contact_id", "workspace_id", "industry", "data"] },
  { table: "re_listings", columns: ["id", "workspace_id", "property_id", "list_date", "status"] },
  { table: "re_tours", columns: ["id", "workspace_id", "property_id", "scheduled_at", "status"] },
  { table: "re_offers", columns: ["id", "workspace_id", "buyer_contact_id", "offer_price_cents", "status"] },
  { table: "re_transactions", columns: ["id", "workspace_id", "side", "sale_price_cents", "closing_status"] },
];

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.");
    process.exit(2);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Pull all (table_name, column_name) tuples from public schema in
  // a single round-trip.
  const { data, error } = await supabase
    .from("_schema_columns_view" as never)
    // We can't query information_schema directly via PostgREST in
    // most setups — fall back to a raw RPC that returns the same
    // shape. If your project doesn't have it, the script logs a
    // helpful create-this-RPC instruction and exits.
    .select("*")
    .limit(1);

  if (error) {
    // Probable: the helper view doesn't exist. Instruct the user.
    console.error(
      "schema check: could not query information_schema view. " +
        "Run this once in your Supabase SQL Editor to enable the check:\n" +
        "\nCREATE OR REPLACE VIEW _schema_columns_view AS\n" +
        "SELECT table_name, column_name, data_type\n" +
        "FROM information_schema.columns\n" +
        "WHERE table_schema = 'public';\n" +
        "\nGRANT SELECT ON _schema_columns_view TO service_role;\n",
    );
    process.exit(2);
  }

  // Re-pull the full set now that we know the view exists.
  const { data: rows, error: pullErr } = await supabase
    .from("_schema_columns_view" as never)
    .select("table_name, column_name");
  if (pullErr) {
    console.error("schema check: pull failed:", pullErr.message);
    process.exit(2);
  }

  const observed = new Map<string, Set<string>>();
  for (const r of (rows || []) as Array<{ table_name: string; column_name: string }>) {
    const set = observed.get(r.table_name) ?? new Set<string>();
    set.add(r.column_name);
    observed.set(r.table_name, set);
  }

  const errors: string[] = [];
  for (const spec of MANIFEST) {
    const cols = observed.get(spec.table);
    if (!cols) {
      errors.push(`✗ table missing: ${spec.table}`);
      continue;
    }
    for (const col of spec.columns) {
      if (!cols.has(col)) {
        errors.push(`✗ ${spec.table}.${col} not in live schema`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("\nSchema introspection FAILED. Live schema diverges from manifest:\n");
    for (const e of errors) console.error("  " + e);
    console.error(
      "\nFix path:\n" +
        "  1. If the column is supposed to exist, apply the migration in supabase/migrations/.\n" +
        "  2. If the manifest is wrong, update scripts/check-schema.ts.\n" +
        "  3. If a migration was applied with a different name than the code expects, reconcile.\n",
    );
    process.exit(1);
  }
  console.log(`✓ Schema check passed — ${MANIFEST.length} tables, ${MANIFEST.reduce((n, s) => n + s.columns.length, 0)} columns verified.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
