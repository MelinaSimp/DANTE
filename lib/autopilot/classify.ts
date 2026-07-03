// lib/autopilot/classify.ts
//
// Deterministic document classifier for the autonomous pipeline. Given
// a document's title, file type, and extracted text, decide what kind
// of CRE document it is so the orchestrator can fire the right
// analysis. Pure and heuristic (no LLM, no network) so it is cheap,
// fast, and unit-testable — the institutional bar wants a predictable
// trigger, not a model guessing on every file drop.

export type DocType =
  | "rent_roll"
  | "lease"
  | "operating_statement"
  | "offering_memo"
  | "environmental"
  | "appraisal"
  | "other";

export interface Classification {
  type: DocType;
  /** 0-1 rough confidence from the strength + number of matched signals. */
  confidence: number;
  signals: string[];
}

interface Input {
  title?: string | null;
  fileType?: string | null;
  text?: string | null;
}

function isSpreadsheet(fileType?: string | null): boolean {
  const ft = (fileType || "").toLowerCase();
  return (
    ft.includes("spreadsheet") ||
    ft.includes("excel") ||
    ft.includes("csv") ||
    ft.endsWith("xlsx") ||
    ft.endsWith("xls") ||
    ft === "xlsx" ||
    ft === "xls" ||
    ft === "csv"
  );
}

/** Count how many of `needles` appear in `hay`. */
function hits(hay: string, needles: string[]): string[] {
  return needles.filter((n) => hay.includes(n));
}

export function classifyDocument(input: Input): Classification {
  const title = (input.title || "").toLowerCase();
  const body = (input.text || "").slice(0, 8000).toLowerCase();
  const hay = `${title}\n${body}`;
  const spreadsheet = isSpreadsheet(input.fileType);

  const scores: Record<DocType, { score: number; signals: string[] }> = {
    rent_roll: { score: 0, signals: [] },
    operating_statement: { score: 0, signals: [] },
    lease: { score: 0, signals: [] },
    offering_memo: { score: 0, signals: [] },
    environmental: { score: 0, signals: [] },
    appraisal: { score: 0, signals: [] },
    other: { score: 0, signals: [] },
  };

  // ── Rent roll ──────────────────────────────────────────────────
  if (title.includes("rent roll") || title.includes("rentroll")) {
    scores.rent_roll.score += 5;
    scores.rent_roll.signals.push('title: "rent roll"');
  }
  if (hay.includes("rent roll") || hay.includes("rentroll")) {
    scores.rent_roll.score += 3;
    scores.rent_roll.signals.push('text: "rent roll"');
  }
  // Column-shape signal: tenant + area + rent together (typical rent-roll header).
  const hasTenant = /\btenant|lessee|occupant\b/.test(hay);
  const hasArea = /\b(sf|sq\s?ft|square feet|rentable|rsf|gla)\b/.test(hay);
  const hasRent = /\b(rent|base rent|annual rent|monthly rent)\b/.test(hay);
  if (hasTenant && hasArea && hasRent) {
    scores.rent_roll.score += spreadsheet ? 4 : 2;
    scores.rent_roll.signals.push("columns: tenant + area + rent");
  }

  // ── Operating statement / T-12 ─────────────────────────────────
  // Multi-word phrases are safe with substring matching; short tokens
  // (noi, t12, p&l) MUST be word-boundary matched or they false-positive
  // inside unrelated words (e.g. "noi" matches "Illinois"/"noise"), which
  // mislabels nearly everything as an operating statement.
  const opPhrases = ["trailing twelve", "operating statement", "income statement", "profit and loss", "net operating income"];
  const opShort: Array<[string, RegExp]> = [
    ["t-12", /\bt-?12\b/],
    ["noi", /\bnoi\b/],
    ["p&l", /\bp&l\b/],
  ];
  const opSignals = [
    ...opPhrases.filter((p) => hay.includes(p)),
    ...opShort.filter(([, re]) => re.test(hay)).map(([label]) => label),
  ];
  if (opSignals.length) {
    scores.operating_statement.score += 2 + opSignals.length;
    scores.operating_statement.signals.push(...opSignals.map((s) => `text: "${s}"`));
  }

  // ── Lease ──────────────────────────────────────────────────────
  if (title.includes("lease")) {
    scores.lease.score += 3;
    scores.lease.signals.push('title: "lease"');
  }
  const leaseStrong = hits(hay, ["lease agreement", "this lease", "commencement date", "demised premises"]);
  if (leaseStrong.length) {
    scores.lease.score += 2 + leaseStrong.length;
    scores.lease.signals.push(...leaseStrong.map((s) => `text: "${s}"`));
  }
  const leaseWeak = hits(hay, ["landlord", "tenant", "lessor", "lessee", "premises", "term of", "base rent"]);
  if (leaseWeak.length >= 3) {
    scores.lease.score += 2;
    scores.lease.signals.push("lease vocabulary cluster");
  }

  // ── Offering memorandum ────────────────────────────────────────
  const omSignals = hits(hay, [
    "offering memorandum",
    "offering memo",
    "investment summary",
    "investment highlights",
    "confidential offering",
    "exclusively listed",
    "broker of record",
  ]);
  if (omSignals.length) {
    scores.offering_memo.score += 2 + omSignals.length;
    scores.offering_memo.signals.push(...omSignals.map((s) => `text: "${s}"`));
  }

  // ── Environmental (Phase I/II ESA, remediation) ────────────────
  // These previously fell into the operating-statement bucket because
  // ESA reports quote NOI-adjacent financial language.
  const envStrong = hits(hay, [
    "environmental site assessment",
    "phase i environmental",
    "phase 1 environmental",
    "phase ii environmental",
    "phase 2 environmental",
    "astm e-1527",
    "astm e1527",
    "recognized environmental condition",
    "innocent landowner",
  ]);
  if (envStrong.length) {
    scores.environmental.score += 4 + envStrong.length;
    scores.environmental.signals.push(...envStrong.map((s) => `text: "${s}"`));
  }
  if (/\bphase\s?(i{1,2}|1|2)\b/.test(title) && /environ/.test(hay)) {
    scores.environmental.score += 4;
    scores.environmental.signals.push('title: "phase I/II" + environmental');
  }
  const envWeak = hits(hay, ["brownfield", "remediation", "underground storage tank", "groundwater", "contamination", "asbestos"]);
  if (envWeak.length >= 2) {
    scores.environmental.score += 2;
    scores.environmental.signals.push("environmental vocabulary cluster");
  }

  // ── Appraisal ──────────────────────────────────────────────────
  if (title.includes("appraisal")) {
    scores.appraisal.score += 4;
    scores.appraisal.signals.push('title: "appraisal"');
  }
  const apprStrong = hits(hay, [
    "appraisal report",
    "appraised value",
    "market value conclusion",
    "uspap",
    "as-is market value",
    "opinion of value",
  ]);
  if (apprStrong.length) {
    scores.appraisal.score += 2 + apprStrong.length;
    scores.appraisal.signals.push(...apprStrong.map((s) => `text: "${s}"`));
  }
  const approaches = hits(hay, ["income approach", "sales comparison approach", "cost approach"]);
  if (approaches.length >= 2) {
    scores.appraisal.score += 3;
    scores.appraisal.signals.push("valuation approaches cluster");
  }

  // Pick the highest score; ties break by this priority order.
  // Environmental and appraisal outrank operating_statement so ESA and
  // appraisal reports that quote financials don't get mislabeled.
  const order: DocType[] = ["rent_roll", "environmental", "appraisal", "operating_statement", "lease", "offering_memo"];
  let best: DocType = "other";
  let bestScore = 0;
  for (const t of order) {
    if (scores[t].score > bestScore) {
      bestScore = scores[t].score;
      best = t;
    }
  }

  if (bestScore < 3) {
    return { type: "other", confidence: 0, signals: [] };
  }

  // Map raw score to a rough 0-1 confidence (saturating).
  const confidence = Math.min(1, bestScore / 9);
  return { type: best, confidence: Math.round(confidence * 100) / 100, signals: scores[best].signals };
}
