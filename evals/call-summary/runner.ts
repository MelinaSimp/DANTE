// Eval harness entrypoint.
//
//   npx tsx evals/call-summary/runner.ts                      # all cases
//   npx tsx evals/call-summary/runner.ts cases/some-case.json # one case
//
// Loads each case JSON, calls the shared summarizer with the case's
// transcript_segments, scores the result, prints a per-case verdict, and
// exits non-zero if any case failed.
//
// This deliberately does NOT touch Supabase, Whisper, or storage — the
// pre-transcribed segments in the case JSON are fed directly to the
// summarizer so the eval measures ONLY the claim-grounding behavior.
// That's the bit a compliance officer cares about.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeCall } from "@/lib/calls/summarize";
import { scoreCase, type EvalCase, type CaseResult } from "./scoring";

// Resolve cases dir relative to this file so the harness works from any cwd.
// tsx supports both CJS and ESM; fileURLToPath handles the ESM case, and we
// fall back to __dirname when it's defined.
const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(HERE, "cases");

function loadCase(filePath: string): EvalCase {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function listCaseFiles(): string[] {
  if (!fs.existsSync(CASES_DIR)) return [];
  return fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(CASES_DIR, f));
}

// ANSI colors — keep the harness easy to scan in CI logs.
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function printCase(r: CaseResult, contactName: string) {
  const status = r.passed
    ? `${GREEN}PASS${RESET}`
    : `${RED}FAIL${RESET}`;
  const verified =
    r.verifiedPct != null ? `${r.verifiedPct}% grounded` : "no claims";
  console.log(`\n${status} ${r.caseId} — ${contactName} (${verified})`);
  if (r.summarySnippet) {
    console.log(`${DIM}  ${r.summarySnippet.replace(/\n/g, " ")}${RESET}`);
  }
  for (const f of r.failures) {
    console.log(`  ${RED}✗ ${f.code}${RESET}: ${f.detail}`);
  }
  for (const w of r.warnings) {
    console.log(`  ${YELLOW}! ${w.code}${RESET}: ${w.detail}`);
  }
}

async function runOne(filePath: string): Promise<CaseResult> {
  const evalCase = loadCase(filePath);
  const contactName =
    evalCase.description.match(/with\s+(\w[\w\s]*)/i)?.[1] || "Client";

  const { structured } = await summarizeCall({
    segments: evalCase.transcript_segments,
    contactName,
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
  });

  const result = scoreCase(evalCase, structured);
  printCase(result, contactName);
  return result;
}

async function main() {
  const arg = process.argv[2];
  const files = arg
    ? [path.resolve(arg)]
    : listCaseFiles();

  if (files.length === 0) {
    console.error(`No cases found in ${CASES_DIR}`);
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Neither OPENAI_API_KEY nor ANTHROPIC_API_KEY is set — the harness calls the real model APIs."
    );
    process.exit(1);
  }

  console.log(`Running ${files.length} case(s) against call-summary pipeline…`);

  const results: CaseResult[] = [];
  for (const f of files) {
    try {
      results.push(await runOne(f));
    } catch (e: any) {
      console.log(`\n${RED}ERROR${RESET} ${path.basename(f)}: ${e?.message || e}`);
      results.push({
        caseId: path.basename(f),
        passed: false,
        failures: [
          { code: "missing_required_section", detail: `Harness error: ${e?.message || e}` },
        ],
        warnings: [],
        verifiedPct: null,
        summarySnippet: "",
      });
    }
  }

  const failed = results.filter((r) => !r.passed);
  console.log(
    `\n${results.length - failed.length}/${results.length} cases passed.`
  );
  if (failed.length > 0) {
    console.log(`${RED}${failed.length} failed:${RESET} ${failed.map((r) => r.caseId).join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
