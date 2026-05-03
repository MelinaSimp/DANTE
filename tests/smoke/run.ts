// tests/smoke/run.ts
//
// Discovers every tests/smoke/[NN]-*.ts path, runs them in order,
// reports pass/fail. Exit 1 on any failure. Run via:
//
//   SMOKE_BASE_URL=https://driftai.studio \
//   SMOKE_AUTH_COOKIE='sb-...=...' \
//   npx tsx tests/smoke/run.ts
//
// In CI, the cookie comes from a secret tied to a dedicated test
// user that lives in a seeded test workspace.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { SmokePath, SmokeContext } from "./types";

async function main() {
  const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
  const authCookie = process.env.SMOKE_AUTH_COOKIE;
  if (!authCookie) {
    console.error("SMOKE_AUTH_COOKIE is required.");
    process.exit(2);
  }
  const ctx: SmokeContext = { baseUrl, authCookie };

  const dir = __dirname;
  const files = readdirSync(dir)
    .filter((f) => /^\d{2}-.+\.ts$/.test(f))
    .sort();

  console.log(`Drift smoke suite — ${files.length} paths against ${baseUrl}\n`);

  let failed = 0;
  for (const file of files) {
    const mod = (await import(join(dir, file))) as { path: SmokePath };
    const p = mod.path;
    let result;
    try {
      result = await p.run(ctx);
    } catch (err) {
      result = {
        pass: false,
        detail: err instanceof Error ? err.message : String(err),
        durationMs: 0,
      };
    }
    const mark = result.pass ? "✓" : "✗";
    const tag = result.detail ? ` — ${result.detail}` : "";
    console.log(`  ${mark} ${p.name.padEnd(20)} ${result.durationMs}ms${tag}`);
    if (!result.pass) failed += 1;
  }

  console.log("");
  if (failed > 0) {
    console.error(`✗ ${failed} of ${files.length} paths failed.`);
    process.exit(1);
  }
  console.log(`✓ All ${files.length} paths passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
