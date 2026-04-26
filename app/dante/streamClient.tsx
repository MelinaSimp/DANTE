// app/dante/streamClient.tsx
//
// Shared SSE-consumer for /api/dante/ask. Both AskDante (the landing
// page input) and ChatThread (the dedicated chat view) render the
// same stream; this module owns the wire-protocol parsing so they
// can stay focused on UI.
//
// State shape is a flat object so it composes cleanly with React's
// useState — `onUpdate` is called with a NEW state object on every
// event (immutable updates), so consumers can pass it straight into
// setState without worrying about render churn.

import type { StepLogEntry } from "@/lib/dante/workflow-types";

export type StreamEvent =
  | { type: "iteration_thinking"; iteration: number }
  | {
      type: "tool_start";
      sub_id: string;
      tool_name: string;
      args: Record<string, unknown>;
      summary?: string;
    }
  | {
      type: "tool_end";
      sub_id: string;
      tool_name: string;
      status: "success" | "error";
      output: unknown;
      error?: string;
      summary?: string;
    };

export interface StreamState {
  streaming: boolean;
  events: StreamEvent[];
  finalContent: string;
  trace: StepLogEntry[];
  chatId?: string;
  messageId?: string;
  error?: string;
}

export function initialStreamState(): StreamState {
  return {
    streaming: false,
    events: [],
    finalContent: "",
    trace: [],
  };
}

interface ConsumeInput {
  body: { message: string; chat_id?: string };
  signal?: AbortSignal;
  onUpdate: (state: StreamState) => void;
}

/**
 * Open the SSE stream and reduce events into StreamState. Resolves
 * when the stream closes; rejects if the request errors before any
 * `final` event lands. Use the AbortSignal to cancel mid-stream
 * (e.g. user navigates away).
 */
export async function consumeAgentStream(input: ConsumeInput): Promise<void> {
  const res = await fetch("/api/dante/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
    signal: input.signal,
  });

  if (!res.ok) {
    // Non-streaming error path (auth, validation). Body is JSON.
    const text = await res.text();
    let msg = `request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) msg = parsed.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  if (!res.body) throw new Error("no response body");

  // Build state mutably inside this scope, push a fresh snapshot to
  // onUpdate after each event. We don't mutate the prior snapshot —
  // React relies on identity for re-renders.
  let state: StreamState = { ...initialStreamState(), streaming: true };
  const push = () => input.onUpdate({ ...state, events: [...state.events] });
  push();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines. Each event has one
    // or more `data: ...` lines we concatenate.
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines = rawEvent
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart());
      if (dataLines.length === 0) continue;
      let payload: unknown;
      try {
        payload = JSON.parse(dataLines.join("\n"));
      } catch {
        continue;
      }
      state = reduce(state, payload);
      push();
    }
  }

  state = { ...state, streaming: false };
  push();
}

function reduce(state: StreamState, raw: unknown): StreamState {
  if (!raw || typeof raw !== "object") return state;
  const ev = raw as { type?: string } & Record<string, unknown>;

  switch (ev.type) {
    case "chat_started":
      return { ...state, chatId: ev.chat_id as string };

    case "iteration_thinking":
      return {
        ...state,
        events: [
          ...state.events,
          { type: "iteration_thinking", iteration: ev.iteration as number },
        ],
      };

    case "tool_start": {
      const event: StreamEvent = {
        type: "tool_start",
        sub_id: ev.sub_id as string,
        tool_name: ev.tool_name as string,
        args: (ev.args as Record<string, unknown>) || {},
        summary: summarizeToolStart(
          ev.tool_name as string,
          ev.args as Record<string, unknown>,
        ),
      };
      return { ...state, events: [...state.events, event] };
    }

    case "tool_end": {
      const event: StreamEvent = {
        type: "tool_end",
        sub_id: ev.sub_id as string,
        tool_name: ev.tool_name as string,
        status: ev.status as "success" | "error",
        output: ev.output,
        error: ev.error as string | undefined,
        summary: summarizeToolEnd(ev.tool_name as string, ev.output),
      };
      return { ...state, events: [...state.events, event] };
    }

    case "final": {
      return {
        ...state,
        finalContent: (ev.content as string) || "",
        trace: (ev.trace as StepLogEntry[]) || [],
        chatId: (ev.chat_id as string) || state.chatId,
        messageId: ev.message_id as string | undefined,
        error: ev.error as string | undefined,
      };
    }

    case "error":
      return { ...state, error: ev.error as string };

    default:
      return state;
  }
}

// Short human-readable hints rendered next to each tool row in the
// live trace. They're not load-bearing — if we can't summarize, we
// just omit and let the bare tool name speak for itself.

function summarizeToolStart(
  toolName: string,
  args: Record<string, unknown>,
): string | undefined {
  const q = typeof args.query === "string" ? args.query : undefined;
  if (toolName === "memory_search" || toolName === "archive_search" || toolName === "vault_cite") {
    return q ? `“${truncate(q, 50)}”` : undefined;
  }
  if (toolName === "clients_query") {
    const filter = args.filter as Record<string, unknown> | undefined;
    if (filter && Object.keys(filter).length > 0) {
      const first = Object.entries(filter)[0];
      return `${first[0]} = ${first[1]}`;
    }
    return "all contacts";
  }
  if (toolName === "skill_run") {
    return typeof args.name === "string" ? args.name : undefined;
  }
  return undefined;
}

function summarizeToolEnd(toolName: string, output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const o = output as Record<string, unknown>;

  if (toolName === "memory_search" || toolName === "archive_search") {
    const hits = o.hits as unknown[] | undefined;
    if (Array.isArray(hits)) return `${hits.length} hit${hits.length === 1 ? "" : "s"}`;
  }
  if (toolName === "vault_cite") {
    const c = o.citations as unknown[] | undefined;
    if (Array.isArray(c)) return `${c.length} citation${c.length === 1 ? "" : "s"}`;
  }
  if (toolName === "clients_query") {
    const c = o.contacts as unknown[] | undefined;
    if (Array.isArray(c)) return `${c.length} contact${c.length === 1 ? "" : "s"}`;
  }
  return undefined;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
