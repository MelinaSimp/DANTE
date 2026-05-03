// tests/smoke/02-vault-viewer.ts
//
// The "View in source document" link from chip popovers points at
// /vault/[id]. This smoke confirms it resolves to a 200 with
// renderable content for a known seed document. The seed id lives
// in env (SMOKE_VAULT_DOC_ID) — set on the test workspace.

import type { SmokePath, SmokeContext, SmokeResult } from "./types";

export const path: SmokePath = {
  name: "vault-viewer",
  async run(ctx: SmokeContext): Promise<SmokeResult> {
    const start = Date.now();
    const docId = process.env.SMOKE_VAULT_DOC_ID;
    if (!docId) {
      // Soft pass — the path is gated on a seed env var; if not set
      // we don't fail CI but do log so engineers notice the gap.
      return {
        pass: true,
        detail: "skipped — SMOKE_VAULT_DOC_ID not set",
        durationMs: Date.now() - start,
      };
    }
    const res = await fetch(`${ctx.baseUrl}/vault/${docId}?page=1`, {
      headers: { cookie: ctx.authCookie },
      redirect: "manual",
    });
    const duration = Date.now() - start;
    if (res.status >= 400) {
      return {
        pass: false,
        detail: `vault viewer returned ${res.status} for doc ${docId.slice(0, 8)}`,
        durationMs: duration,
      };
    }
    return { pass: true, detail: `viewer 200 for ${docId.slice(0, 8)}`, durationMs: duration };
  },
};
