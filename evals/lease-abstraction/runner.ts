// evals/lease-abstraction/runner.ts
//
// CLI runner for the lease abstraction accuracy benchmark.
//
// Usage:
//   npx tsx evals/lease-abstraction/runner.ts                          # score cached responses
//   npx tsx evals/lease-abstraction/runner.ts --case=sample-nnn-lease  # one case
//   npx tsx evals/lease-abstraction/runner.ts --live                   # live API (needs ANTHROPIC_API_KEY)
//   npx tsx evals/lease-abstraction/runner.ts --live --case=sample-nnn-lease
//
// In default (cached) mode, the runner loads pre-saved markdown
// responses from responses/<case-id>.md and scores them. This lets
// you iterate on the scorer without burning API calls.
//
// In --live mode, the runner constructs the abstract_lease prompt,
// calls the Anthropic API, saves the response to responses/, and
// then scores it.

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreAbstract } from "./scorer";
import type {
  LeaseEvalCase,
  LeaseEvalResult,
  LeaseEvalSummary,
  CategoryMetrics,
  FieldCategory,
} from "./types";

// ── Path resolution ──────────────────────────────────────────────

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : join(fileURLToPath(import.meta.url), "..");

const FIXTURES_DIR = join(HERE, "fixtures");
const RESPONSES_DIR = join(HERE, "responses");
const RESULTS_DIR = join(HERE, "results");

// ── ANSI colors ──────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ── CLI arg parsing ──────────────────────────────────────────────

interface ParsedArgs {
  live: boolean;
  caseFilter?: string;
}

function parseArgs(): ParsedArgs {
  const out: ParsedArgs = { live: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--live") {
      out.live = true;
      continue;
    }
    const m = arg.match(/^--case=(.+)$/);
    if (m) out.caseFilter = m[1];
  }
  return out;
}

// ── Case loading ─────────────────────────────────────────────────

function loadCases(filter?: string): LeaseEvalCase[] {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  const cases: LeaseEvalCase[] = [];
  for (const file of files) {
    const raw = readFileSync(join(FIXTURES_DIR, file), "utf8");
    const parsed = JSON.parse(raw) as LeaseEvalCase;
    if (filter && parsed.id !== filter && basename(file, ".json") !== filter) {
      continue;
    }
    cases.push(parsed);
  }
  return cases;
}

// ── Live API call ────────────────────────────────────────────────

/**
 * Build the prompt that mirrors what the abstract_lease skill sends.
 * This is a simplified version -- the real skill uses vault.cite tool
 * calls in a multi-step agent loop. For eval purposes we send a single
 * prompt asking for the abstract in one shot.
 */
function buildAbstractPrompt(evalCase: LeaseEvalCase): string {
  return [
    "You are abstracting a commercial lease on behalf of a CRE broker.",
    "Accuracy is paramount -- every number, date, and name must carry a vault citation.",
    "Do not invent terms. If a field is not in the document, say 'Not found in document.'",
    "Output structured markdown, not prose.",
    "",
    `Abstract the lease for "${evalCase.document_name}".`,
    `Lease type: ${evalCase.lease_type.toUpperCase()}.`,
    "",
    "Extract every standard CRE lease field: parties, premises, term, rent schedule,",
    "escalations, percentage rent breakpoint, CAM/operating expenses, tax escalation/pass-through,",
    "security deposit, TI allowance, permitted use, exclusivity, assignment/subletting,",
    "termination provisions, renewal/expansion options, SNDA/estoppel, holdover rate,",
    "environmental/hazmat provisions, insurance requirements, default/remedies, parking, and signage.",
    "",
    "Present each field with its vault citation inline using [v1] [v2] etc. markers.",
    "Flag any standard fields not found in the document.",
  ].join("\n");
}

async function callLiveApi(evalCase: LeaseEvalCase): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Use cached mode (no --live flag) or set the env var.",
    );
  }

  // Dynamic import so the runner can be loaded without the SDK installed
  // (cached mode doesn't need it).
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const prompt = buildAbstractPrompt(evalCase);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? (b as { text: string }).text : ""))
    .join("\n");

  return text;
}

// ── Response caching ─────────────────────────────────────────────

function getCachedResponse(caseId: string): string | null {
  const path = join(RESPONSES_DIR, `${caseId}.md`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

function saveCachedResponse(caseId: string, markdown: string): void {
  if (!existsSync(RESPONSES_DIR)) mkdirSync(RESPONSES_DIR, { recursive: true });
  writeFileSync(join(RESPONSES_DIR, `${caseId}.md`), markdown, "utf8");
}

// ── Result output ────────────────────────────────────────────────

function printFieldResults(result: LeaseEvalResult): void {
  const COL_FIELD = 24;
  const COL_CAT = 12;
  const COL_MATCH = 7;
  const COL_CITED = 7;

  const header = [
    "Field".padEnd(COL_FIELD),
    "Category".padEnd(COL_CAT),
    "Match".padEnd(COL_MATCH),
    "Cited".padEnd(COL_CITED),
    "Notes",
  ].join("  ");

  console.log(`  ${DIM}${header}${RESET}`);
  console.log(`  ${DIM}${"─".repeat(header.length + 10)}${RESET}`);

  for (const fr of result.field_results) {
    const matchStr = fr.match
      ? `${GREEN}yes${RESET}`
      : `${RED}no${RESET}`;
    const citedStr = fr.actual === null
      ? `${DIM}n/a${RESET}`
      : fr.cited
        ? `${GREEN}yes${RESET}`
        : `${YELLOW}no${RESET}`;
    const notes = fr.notes ? `${DIM}${fr.notes}${RESET}` : "";

    // Pad with visible-character-aware padding (ANSI codes are zero-width)
    const fieldCol = fr.field_name.padEnd(COL_FIELD);
    const catCol = fr.category.padEnd(COL_CAT);

    console.log(`  ${fieldCol}  ${catCol}  ${matchStr.padEnd(COL_MATCH + 9)}  ${citedStr.padEnd(COL_CITED + 9)}  ${notes}`);
  }
}

function printCaseResult(result: LeaseEvalResult): void {
  const pct = (n: number) => (n * 100).toFixed(1) + "%";
  const f1Color = result.f1 >= 0.9 ? GREEN : result.f1 >= 0.7 ? YELLOW : RED;
  const citeColor =
    result.citation_rate >= 0.9 ? GREEN : result.citation_rate >= 0.7 ? YELLOW : RED;

  console.log(
    `\n${BOLD}${result.case_id}${RESET}  ` +
      `F1=${f1Color}${pct(result.f1)}${RESET}  ` +
      `P=${pct(result.precision)}  R=${pct(result.recall)}  ` +
      `Citations=${citeColor}${pct(result.citation_rate)}${RESET}  ` +
      `(${result.matched}/${result.total_fields} matched, ${result.missed} missed, ${result.uncited} uncited)`,
  );
  printFieldResults(result);
}

function printSummary(summary: LeaseEvalSummary): void {
  const pct = (n: number) => (n * 100).toFixed(1) + "%";

  console.log("\n" + "=".repeat(70));
  console.log(`${BOLD}Lease Abstraction Eval Summary${RESET}`);
  console.log("=".repeat(70));
  console.log(`  Cases run:      ${summary.cases_run}`);
  console.log(`  Aggregate F1:   ${pct(summary.aggregate_f1)}`);
  console.log(`  Precision:      ${pct(summary.aggregate_precision)}`);
  console.log(`  Recall:         ${pct(summary.aggregate_recall)}`);
  console.log(`  Citation rate:  ${pct(summary.aggregate_citation_rate)}`);

  const categories = Object.keys(summary.per_category).sort();
  if (categories.length > 0) {
    console.log(`\n  ${DIM}Per-category breakdown:${RESET}`);
    for (const cat of categories) {
      const m = summary.per_category[cat];
      console.log(
        `    ${cat.padEnd(14)}  P=${pct(m.precision).padEnd(7)}  R=${pct(m.recall).padEnd(7)}  F1=${pct(m.f1)}`,
      );
    }
  }
  console.log("=".repeat(70));
}

// ── Aggregation ──────────────────────────────────────────────────

function aggregate(results: LeaseEvalResult[]): LeaseEvalSummary {
  let totalMatched = 0;
  let totalFields = 0;
  let totalExtracted = 0;
  let totalCited = 0;

  const catBuckets: Record<
    string,
    { matched: number; total: number; extracted: number }
  > = {};

  for (const r of results) {
    totalMatched += r.matched;
    totalFields += r.total_fields;

    for (const fr of r.field_results) {
      const cat = fr.category;
      if (!catBuckets[cat]) {
        catBuckets[cat] = { matched: 0, total: 0, extracted: 0 };
      }
      catBuckets[cat].total++;
      if (fr.actual !== null) {
        catBuckets[cat].extracted++;
        totalExtracted++;
        if (fr.cited) totalCited++;
      }
      if (fr.match) catBuckets[cat].matched++;
    }
  }

  const aggPrecision =
    totalExtracted > 0 ? totalMatched / totalExtracted : 0;
  const aggRecall = totalFields > 0 ? totalMatched / totalFields : 0;
  const aggF1 =
    aggPrecision + aggRecall > 0
      ? (2 * aggPrecision * aggRecall) / (aggPrecision + aggRecall)
      : 0;
  const aggCitationRate =
    totalExtracted > 0 ? totalCited / totalExtracted : 0;

  const perCategory: Record<string, CategoryMetrics> = {};
  for (const [cat, b] of Object.entries(catBuckets)) {
    const p = b.extracted > 0 ? b.matched / b.extracted : 0;
    const r = b.total > 0 ? b.matched / b.total : 0;
    const f1 = p + r > 0 ? (2 * p * r) / (p + r) : 0;
    perCategory[cat] = { precision: p, recall: r, f1 };
  }

  return {
    timestamp: new Date().toISOString(),
    cases_run: results.length,
    aggregate_precision: aggPrecision,
    aggregate_recall: aggRecall,
    aggregate_f1: aggF1,
    aggregate_citation_rate: aggCitationRate,
    per_category: perCategory,
    results,
  };
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const cases = loadCases(args.caseFilter);

  if (cases.length === 0) {
    console.error(`No cases found${args.caseFilter ? ` matching "${args.caseFilter}"` : ""} in ${FIXTURES_DIR}`);
    process.exit(1);
  }

  const mode = args.live ? "LIVE" : "cached";
  console.log(
    `Lease Abstraction Eval: ${cases.length} case(s), ${mode} mode\n`,
  );

  const results: LeaseEvalResult[] = [];

  for (const evalCase of cases) {
    let markdown: string | null = null;

    if (args.live) {
      console.log(`${DIM}  Calling API for ${evalCase.id}...${RESET}`);
      try {
        markdown = await callLiveApi(evalCase);
        saveCachedResponse(evalCase.id, markdown);
        console.log(`${DIM}  Response saved to responses/${evalCase.id}.md${RESET}`);
      } catch (err: any) {
        console.error(
          `${RED}  API call failed for ${evalCase.id}: ${err?.message || err}${RESET}`,
        );
      }
    } else {
      markdown = getCachedResponse(evalCase.id);
      if (markdown === null) {
        console.log(
          `${YELLOW}  No cached response for ${evalCase.id} -- run with --live to generate, or place a .md file in responses/${RESET}`,
        );
        continue;
      }
    }

    if (!markdown) continue;

    const result = scoreAbstract(markdown, evalCase.expected_fields, evalCase.id);
    results.push(result);
    printCaseResult(result);
  }

  if (results.length === 0) {
    console.log(
      `\nNo results to summarize. ${args.live ? "All API calls failed." : "No cached responses found. Run with --live or add .md files to responses/."}`,
    );
    process.exit(1);
  }

  const summary = aggregate(results);
  printSummary(summary);

  // Save results
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(RESULTS_DIR, `${timestamp}.json`);
  writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`\nResults saved to ${outPath}`);

  // Exit non-zero if aggregate F1 is below threshold
  const F1_THRESHOLD = 0.7;
  if (summary.aggregate_f1 < F1_THRESHOLD) {
    console.log(
      `\n${RED}Aggregate F1 ${(summary.aggregate_f1 * 100).toFixed(1)}% is below threshold ${(F1_THRESHOLD * 100).toFixed(0)}%${RESET}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
