// tests/smoke/01-chat.ts
//
// Streams a chat response. Confirms at least one SSE frame arrives
// AND the final frame includes a message_id. Doesn't assert on the
// content (model output varies); just on the transport + persistence.

import type { SmokePath, SmokeContext, SmokeResult } from "./types";

export const path: SmokePath = {
  name: "chat",
  async run(ctx: SmokeContext): Promise<SmokeResult> {
    const start = Date.now();
    const res = await fetch(`${ctx.baseUrl}/api/assistant/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: ctx.authCookie,
      },
      body: JSON.stringify({ message: "smoke test ping — ignore" }),
    });
    if (!res.ok || !res.body) {
      return {
        pass: false,
        detail: `ask returned ${res.status}`,
        durationMs: Date.now() - start,
      };
    }

    // Parse the SSE stream, looking for {type:"final"}.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawFinal = false;
    let messageId: string | undefined;
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
            message_id?: string;
          };
          if (parsed.type === "final") {
            sawFinal = true;
            messageId = parsed.message_id;
          }
        } catch {
          /* ignore malformed frame */
        }
      }
    }
    const duration = Date.now() - start;
    if (!sawFinal) {
      return { pass: false, detail: "no `final` SSE frame", durationMs: duration };
    }
    if (!messageId) {
      return { pass: false, detail: "final frame missing message_id", durationMs: duration };
    }
    return { pass: true, detail: `message ${messageId.slice(0, 8)}…`, durationMs: duration };
  },
};
