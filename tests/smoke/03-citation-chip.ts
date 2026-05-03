// tests/smoke/03-citation-chip.ts
//
// Asks a doc-grounded question against the seeded test workspace.
// The seeded workspace has a known vault doc + a known query that
// retrieves it. Confirms:
//   - the response contains at least one [v\d+] marker
//   - the citation_report SSE frame arrives
//   - the report's overall is "valid" or "partial" (not "invalid")
//
// Without this path we'd be smoke-testing the transport but not
// the citation chain — which is the load-bearing thesis of the
// product.

import type { SmokePath, SmokeContext, SmokeResult } from "./types";

const QUERY =
  process.env.SMOKE_CITATION_QUERY ??
  "Give me a one-line summary of any vault document.";

const CITATION_RE = /\[v\d+\]/;

export const path: SmokePath = {
  name: "citation-chip",
  async run(ctx: SmokeContext): Promise<SmokeResult> {
    const start = Date.now();
    const res = await fetch(`${ctx.baseUrl}/api/assistant/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: ctx.authCookie },
      body: JSON.stringify({ message: QUERY }),
    });
    if (!res.ok || !res.body) {
      return {
        pass: false,
        detail: `ask returned ${res.status}`,
        durationMs: Date.now() - start,
      };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalContent = "";
    let citationOverall: string | undefined;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const parsed = JSON.parse(dataLine.slice(5).trim()) as {
            type?: string;
            content?: string;
            report?: { overall?: string };
          };
          if (parsed.type === "final") finalContent = parsed.content ?? "";
          if (parsed.type === "citation_report") citationOverall = parsed.report?.overall;
        } catch {
          /* ignore */
        }
      }
    }
    const duration = Date.now() - start;
    if (!CITATION_RE.test(finalContent)) {
      return {
        pass: false,
        detail: "no [v\\d] marker in response",
        durationMs: duration,
      };
    }
    if (!citationOverall) {
      return {
        pass: false,
        detail: "no citation_report frame",
        durationMs: duration,
      };
    }
    if (citationOverall === "invalid") {
      return {
        pass: false,
        detail: "citation_report.overall = invalid",
        durationMs: duration,
      };
    }
    return { pass: true, detail: `citations ${citationOverall}`, durationMs: duration };
  },
};
