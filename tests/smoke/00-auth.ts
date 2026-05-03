// tests/smoke/00-auth.ts
//
// First path. If this fails, every subsequent path fails too —
// reporting it first attributes the failure correctly.

import type { SmokePath, SmokeContext, SmokeResult } from "./types";

export const path: SmokePath = {
  name: "auth",
  async run(ctx: SmokeContext): Promise<SmokeResult> {
    const start = Date.now();
    const res = await fetch(`${ctx.baseUrl}/api/auth/whoami`, {
      headers: { cookie: ctx.authCookie },
    });
    const duration = Date.now() - start;
    if (!res.ok) {
      return {
        pass: false,
        detail: `whoami returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
        durationMs: duration,
      };
    }
    const json = (await res.json()) as { user?: { id?: string } };
    if (!json.user?.id) {
      return {
        pass: false,
        detail: "whoami body did not contain user.id",
        durationMs: duration,
      };
    }
    return { pass: true, detail: `user ${json.user.id.slice(0, 8)}…`, durationMs: duration };
  },
};
