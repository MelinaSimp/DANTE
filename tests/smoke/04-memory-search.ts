// tests/smoke/04-memory-search.ts
//
// Hits the memory.search RPC (via a dedicated debug endpoint) to
// confirm it doesn't error with the type-mismatch we saw in
// production. The endpoint is internal-only and gated; smoke uses
// the test user's auth.

import type { SmokePath, SmokeContext, SmokeResult } from "./types";

export const path: SmokePath = {
  name: "memory-search",
  async run(ctx: SmokeContext): Promise<SmokeResult> {
    const start = Date.now();
    const res = await fetch(`${ctx.baseUrl}/api/dev/memory-search-probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: ctx.authCookie },
      body: JSON.stringify({ query: "smoke test query" }),
    });
    const duration = Date.now() - start;
    if (!res.ok) {
      const body = await res.text();
      return {
        pass: false,
        detail: `probe returned ${res.status}: ${body.slice(0, 200)}`,
        durationMs: duration,
      };
    }
    const json = (await res.json()) as {
      ok?: boolean;
      hits?: number;
      error?: string;
    };
    if (json.error) {
      return {
        pass: false,
        detail: `memory_search RPC error: ${json.error}`,
        durationMs: duration,
      };
    }
    return {
      pass: true,
      detail: `${json.hits ?? 0} hits`,
      durationMs: duration,
    };
  },
};
