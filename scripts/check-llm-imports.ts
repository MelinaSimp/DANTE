// scripts/check-llm-imports.ts
//
// Phase 3 W3.7 — guard against direct OpenAI usage outside lib/llm/.
//
// ADR 0001 mandates that every LLM call go through lib/llm/client.ts
// so a future provider swap stays a localized change. The 10 SDK-
// imported sites were migrated in Phase 0; ~28 raw-fetch sites
// remain (PARITY-001). This script catches new violations.
//
// Run:
//   npx tsx scripts/check-llm-imports.ts
//
// CI: wired into the `npm run check:llm` script and intended to
// run as a step in the build pipeline. The script exits 0 when
// the count of violations matches the recorded baseline (so
// existing PARITY-001 sites don't block every PR), 1 when the
// count grows.
//
// Adjust BASELINE down (never up) as raw-fetch sites are migrated.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "lib", "scripts"];
// Files allowed to import openai or fetch api.openai.com directly.
const ALLOWLIST = [
  "lib/llm/client.ts",
  "lib/llm/types.ts",
  "scripts/check-llm-imports.ts",
];
// Recorded baseline of remaining violations. PARITY-001. Decrement
// this number when migrating raw-fetch sites; never increment.
// Today: 49 (mix of raw `fetch("api.openai.com")` calls in app/api
// routes and lib/* helpers). Goal: 0.
const BASELINE = 49;

const PATTERNS: RegExp[] = [
  /from\s+["']openai["']/,
  /require\(\s*["']openai["']\s*\)/,
  /https:\/\/api\.openai\.com/,
];

interface Violation {
  file: string;
  line: number;
  match: string;
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === "dist") continue;
      yield* walk(path);
    } else if (
      st.isFile() &&
      (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".js") || name.endsWith(".mjs"))
    ) {
      yield path;
    }
  }
}

function scan(): Violation[] {
  const out: Violation[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (ALLOWLIST.includes(rel)) continue;
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        for (const re of PATTERNS) {
          if (re.test(line)) {
            out.push({ file: rel, line: i + 1, match: line.trim().slice(0, 120) });
            return;
          }
        }
      });
    }
  }
  return out;
}

const violations = scan();
console.log(`OpenAI direct-usage scan: ${violations.length} violation${violations.length === 1 ? "" : "s"} (baseline: ${BASELINE})`);
if (violations.length > BASELINE) {
  console.error("\n❌ Direct-usage count grew beyond baseline.");
  console.error("Every new LLM call must route through lib/llm/client.ts (ADR 0001).");
  console.error("\nFiles introducing new direct usage:");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.match}`);
  }
  process.exit(1);
}
if (violations.length < BASELINE) {
  console.log(
    `✓ Below baseline. Decrement BASELINE in scripts/check-llm-imports.ts to ${violations.length} to lock in the win.`,
  );
}
process.exit(0);
