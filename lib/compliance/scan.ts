// Compliance scanner entrypoint.
//
// Takes a piece of text (call summary, email draft, note body) and
// returns a list of potential compliance flags. Two layers:
//
//   1. Deterministic rules (lib/compliance/rules.ts) — fast, free,
//      explainable. Always run.
//   2. LLM analysis — opt-in, provides fuzzier judgment for things
//      rules can't catch. Returns empty if no API key is configured.
//
// This module does NOT write to the database. The API route
// (app/api/compliance/scan/route.ts) does that so ownership /
// workspace-scoping stays in the HTTP layer.
//
// The output shape mirrors the compliance_flags table columns so the
// API route can insert with minimal transformation.

import { RULES, type ComplianceRule, type RuleSeverity } from "./rules";

export type FlagCitation = {
  source_key: string;
  chunk_index?: number;
  quote: string;
};

export type ScanFlag = {
  layer: "rule" | "llm";
  rule_id: string | null;
  severity: RuleSeverity;
  message: string;
  citations: FlagCitation[];
  excerpt: string; // the substring from scanned_text that fired the rule
};

export type ScanInput = {
  text: string;
  contextLabel?: string; // e.g. "Call summary for Margaret Johnson, 2026-04-19"
  anthropicKey?: string; // optional — enables LLM layer
};

export type ScanResult = {
  flags: ScanFlag[];
  rulesFired: number;
  llmCalled: boolean;
  durationMs: number;
};

function runRule(rule: ComplianceRule, text: string): ScanFlag[] {
  const out: ScanFlag[] = [];
  for (const pattern of rule.patterns) {
    const match = text.match(pattern);
    if (match) {
      // Capture a short excerpt around the match for the reviewer UI.
      const idx = match.index ?? 0;
      const start = Math.max(0, idx - 40);
      const end = Math.min(text.length, idx + match[0].length + 40);
      const excerpt = text.slice(start, end).trim();
      out.push({
        layer: "rule",
        rule_id: rule.id,
        severity: rule.severity,
        message: rule.message,
        citations: rule.citations,
        excerpt,
      });
      // One firing per rule is enough — we don't want 10 flags for the
      // same rule hitting the same text. The reviewer sees the rule +
      // an excerpt; they can scan the full text themselves.
      break;
    }
  }
  return out;
}

// LLM layer — asks Claude to look for fuzzier violations the regex
// can't catch (implied guarantees, tone, suitability gaps given a
// known-short engagement). Returns flags in the same shape as the
// rule layer. If the key is missing or the call fails, returns [].
async function runLlmLayer(
  text: string,
  contextLabel: string | undefined,
  anthropicKey: string
): Promise<ScanFlag[]> {
  const prompt = `You are a compliance reviewer for a US-registered investment adviser (RIA). Review the following advisor communication for potential violations of FINRA Rule 2210 (communications standards), SEC Regulation Best Interest (Care Obligation), and the SEC Investment Advisers Act fiduciary standard.

Only flag issues the deterministic regex layer could NOT catch. Do not flag explicit guarantees, risk-free claims, or blanket recommendations — those are already caught. Focus on:

- Implied performance promises ("you'll be set for retirement", "this never goes down in the long run")
- Missing risk disclosure when a specific product is recommended
- Language that assumes facts about the client not in the communication
- Fee / conflict-of-interest statements that could mislead
- Out-of-scope advice (tax, legal, insurance) not hedged with a professional-referral caveat

Return a JSON array. Empty array if nothing fires. Schema per item:
{
  "severity": "info" | "warn" | "block",
  "message": "one sentence describing the issue and how to fix it",
  "excerpt": "the exact substring from the text that triggered",
  "citation": { "source_key": "finra-2210" | "sec-reg-bi" | "irs-pub-590b-2025" | "sec-adv-part-2a", "quote": "short relevant excerpt from that source" }
}

Context: ${contextLabel || "advisor communication"}

TEXT TO REVIEW:
${text.slice(0, 8000)}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1200,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) return [];
    const d = await r.json();
    const raw = (d.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text || "")
      .join("")
      .trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p: any): ScanFlag | null => {
        if (!p?.message || !p?.excerpt) return null;
        const sev: RuleSeverity =
          p.severity === "block"
            ? "block"
            : p.severity === "warn"
            ? "warn"
            : "info";
        return {
          layer: "llm",
          rule_id: null,
          severity: sev,
          message: String(p.message),
          excerpt: String(p.excerpt),
          citations: p.citation
            ? [
                {
                  source_key: String(p.citation.source_key || ""),
                  quote: String(p.citation.quote || ""),
                },
              ]
            : [],
        };
      })
      .filter((x): x is ScanFlag => x !== null);
  } catch {
    return [];
  }
}

export async function scanForCompliance(
  input: ScanInput
): Promise<ScanResult> {
  const t0 = Date.now();

  const flags: ScanFlag[] = [];
  let rulesFired = 0;
  for (const rule of RULES) {
    const fires = runRule(rule, input.text);
    flags.push(...fires);
    rulesFired += fires.length;
  }

  let llmCalled = false;
  if (input.anthropicKey) {
    llmCalled = true;
    const llmFlags = await runLlmLayer(
      input.text,
      input.contextLabel,
      input.anthropicKey
    );
    flags.push(...llmFlags);
  }

  return {
    flags,
    rulesFired,
    llmCalled,
    durationMs: Date.now() - t0,
  };
}
