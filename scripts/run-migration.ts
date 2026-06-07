#!/usr/bin/env npx tsx
// scripts/run-migration.ts
//
// Standalone migration runner. Runs the n8n migration for all workspaces.
// Usage:
//   npx tsx scripts/run-migration.ts --dry-run   # validate only
//   npx tsx scripts/run-migration.ts              # real migration

import { config } from "dotenv";
config({ path: ".env.local" });

// Verify env loaded before any other imports
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("dotenv failed to load .env.local -- trying manual path");
  config({ path: `${__dirname}/../.env.local` });
}

// Dynamic import so env is loaded first
async function loadMigration() {
  const mod = await import("../lib/dante/n8n-migration");
  return mod.migrateAllWorkspaces;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`\n=== n8n Migration Runner ===`);
  console.log(`Mode: ${dryRun ? "DRY RUN (validate only)" : "LIVE MIGRATION"}`);
  console.log(`n8n URL: ${process.env.DRIFT_N8N_BASE_URL}`);
  console.log(`API key: ${process.env.DRIFT_N8N_API_KEY ? "set" : "MISSING"}`);
  console.log(`Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`Service key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING"}\n`);

  if (!process.env.DRIFT_N8N_BASE_URL || !process.env.DRIFT_N8N_API_KEY) {
    console.error("ERROR: DRIFT_N8N_BASE_URL and DRIFT_N8N_API_KEY must be set");
    process.exit(1);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY must be set");
    process.exit(1);
  }

  const migrateAllWorkspaces = await loadMigration();
  const { reports, summary } = await migrateAllWorkspaces(dryRun);

  console.log(`\n=== Migration Summary ===`);
  console.log(`Workspaces: ${summary.workspaces}`);
  console.log(`Total workflows: ${summary.totalWorkflows}`);
  console.log(`Migrated: ${summary.migrated}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Failed: ${summary.failed}`);

  for (const report of reports) {
    console.log(`\n--- Workspace: ${report.workspaceId} ---`);
    for (const r of report.results) {
      const status = r.status.toUpperCase().padEnd(15);
      const n8nId = r.n8nWorkflowId ? ` -> n8n:${r.n8nWorkflowId}` : "";
      const warn = r.warnings?.length ? ` [${r.warnings.length} warnings]` : "";
      const err = r.error ? ` ERROR: ${r.error}` : "";
      console.log(`  ${status} ${r.workflowName}${n8nId}${warn}${err}`);
    }
  }

  if (summary.failed > 0) {
    console.log(`\nWARNING: ${summary.failed} workflow(s) failed migration`);
    process.exit(1);
  }

  console.log(`\nDone.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
