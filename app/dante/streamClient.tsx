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
  | {
      type: "iteration_thinking";
      iteration: number;
      /** Natural-language preamble parsed from the model's message
       *  before the tool batch. Renders as the step heading in the
       *  Harvey-style trace. */
      summary?: string;
    }
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

/** Citation validator report — populated by the citation_report SSE
 *  frame. The chat UI decorates citation chips with per-marker
 *  status using this. See lib/dante/citation-validator.ts. */
export interface CitationReportState {
  overall: "valid" | "partial" | "invalid" | "unverifiable" | "no_citations";
  checks: Array<{
    marker: string;
    type: "vault" | "memory";
    status:
      | "valid"
      | "missing"
      | "quote_mismatch"
      | "page_mismatch"
      | "doc_missing"
      | "unverifiable";
    detail?: string;
  }>;
  counts: { total: number; valid: number; failed: number; unverifiable: number };
}

/** Grounding score state — populated by the `grounding` SSE frame.
 *  Mirrors lib/dante/grounding.ts's GroundingScore. */
export interface GroundingState {
  score: number;
  tier: "strong" | "partial" | "general" | "none";
  summary: string;
}

/** Document artifact produced by the document.create or document.edit
 *  tools. Extracted from tool_end events and rendered as cards below
 *  the assistant message. */
export interface DocumentArtifact {
  vault_item_id: string;
  url: string | null;
  filename: string;
  format: "pdf" | "docx";
  size_bytes: number;
  title: string;
  section_count: number;
}

/** Structured input request — emitted when a workflow or tool needs
 *  configuration values from the user before it can proceed. Rendered
 *  as an inline form card in the chat. */
export interface NeedsInputField {
  key: string;
  label: string;
  placeholder?: string;
}
export interface NeedsInputState {
  question: string;
  fields: NeedsInputField[];
  /** When set, the card's submit handler re-runs this workflow after
   *  setting the secrets. */
  workflow_name?: string;
}

export interface StreamState {
  streaming: boolean;
  events: StreamEvent[];
  finalContent: string;
  trace: StepLogEntry[];
  /** Suggested follow-up questions, populated by the followups SSE
   *  event a moment after the final answer lands. */
  followups: string[];
  /** Citation validator output, populated by the citation_report SSE
   *  frame after final. Null while still verifying. */
  citationReport?: CitationReportState | null;
  /** Grounding score, populated by the `grounding` SSE frame. */
  grounding?: GroundingState | null;
  /** Documents generated during this turn. Extracted from tool_end
   *  events for document_create and document_edit. */
  documents: DocumentArtifact[];
  /** Structured input request from a tool that needs configuration. */
  needsInput?: NeedsInputState | null;
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
    followups: [],
    documents: [],
  };
}

interface ConsumeInput {
  /** Override the default /api/dante/ask endpoint. Used to route
   *  Deep Research turns through /api/dante/deep-research and
   *  Web-Scraper turns through /api/dante/web-scrape. The wire
   *  protocol (SSE event names) is identical, only the endpoint
   *  changes. */
  endpoint?: string;
  body: {
    message: string;
    chat_id?: string;
    deep?: boolean;
    /** Scope the agent to one contact's memory + correspondence. */
    context_contact_id?: string;
    context_contact_name?: string;
    /** Scope the agent to one property — includes its linked clients
     *  and attached documents in the system prompt. */
    context_property_id?: string;
    context_property_label?: string;
    /** Scope retrieval to one vault project. */
    context_project_id?: string;
    /** Files the user attached via the composer's paperclip. Bytes
     *  are extracted in the Electron main process — only the text
     *  reaches the server. When present, the server forces local_only
     *  for the turn (Hermes composes the reply). */
    attachments?: Array<{
      name: string;
      ext?: string;
      text: string;
      truncated?: boolean;
    }>;
  };
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
  const res = await fetch(input.endpoint ?? "/api/dante/ask", {
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
          {
            type: "iteration_thinking",
            iteration: ev.iteration as number,
            summary: ev.summary as string | undefined,
          },
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
      // Extract document artifacts from document tool completions
      const tn = ev.tool_name as string;
      const out = ev.output as Record<string, unknown> | undefined;
      if (
        (tn === "document_create" || tn === "document_edit") &&
        out &&
        typeof out.vault_item_id === "string" &&
        ev.status === "success"
      ) {
        const doc: DocumentArtifact = {
          vault_item_id: out.vault_item_id as string,
          url: (out.url as string) || null,
          filename: (out.filename as string) || "document",
          format: (out.format as "pdf" | "docx") || "pdf",
          size_bytes: (out.size_bytes as number) || 0,
          title: (out.title as string) || "Document",
          section_count: (out.section_count as number) || 0,
        };
        return { ...state, events: [...state.events, event], documents: [...state.documents, doc] };
      }
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

    case "followups": {
      const arr = ev.suggestions;
      if (!Array.isArray(arr)) return state;
      return {
        ...state,
        followups: arr.filter((s): s is string => typeof s === "string"),
      };
    }

    case "citation_report": {
      // Validator output — quietly attaches to state; renderer picks
      // it up. If the shape doesn't match what we expect (provider
      // change), we skip rather than crash.
      const report = ev.report as CitationReportState | undefined;
      if (!report || typeof report !== "object" || !Array.isArray(report.checks)) {
        return state;
      }
      return { ...state, citationReport: report };
    }

    case "grounding": {
      const g = ev.grounding as GroundingState | undefined;
      if (!g || typeof g.score !== "number" || typeof g.tier !== "string") {
        return state;
      }
      return { ...state, grounding: g };
    }

    case "needs_input": {
      const ni = ev as unknown as {
        type: "needs_input";
        question: string;
        fields: NeedsInputField[];
        workflow_name?: string;
      };
      if (!ni.question || !Array.isArray(ni.fields)) return state;
      return {
        ...state,
        needsInput: {
          question: ni.question,
          fields: ni.fields,
          workflow_name: ni.workflow_name,
        },
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
  if (toolName === "document_create") {
    const title = typeof args.title === "string" ? args.title : undefined;
    const fmt = typeof args.format === "string" ? args.format.toUpperCase() : "";
    return title ? `${truncate(title, 40)} (${fmt})` : fmt || undefined;
  }
  if (toolName === "document_edit") {
    return "Updating document";
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
  if (toolName === "document_create" || toolName === "document_edit") {
    const title = o.title as string | undefined;
    const fmt = o.format as string | undefined;
    if (title) return `${title} (${fmt?.toUpperCase() || "PDF"})`;
  }
  return undefined;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
