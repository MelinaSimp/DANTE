# Dante Phases 1–3 — Design Doc

**Status:** All three phases shipped · 2026-04-25
**Phase 1 scope (shipped):** `dante_memory` store, `agent` workflow node, MCP tool scaffolding
**Phase 2 scope (shipped):** Wealthbox MCP server, Google OAuth (Gmail + Calendar), vault citations
**Phase 3 scope (shipped):** Skills registry with versioned auto-approve gating

A polish pass remains: agent-node authoring UI, skill editor UI, push-notification subscriptions for Calendar (we poll today), and column-level encryption of stored OAuth tokens.

The goal of Phase 1 is to land the *substrate* the rest of the roadmap rides on:

1. A persistent memory store Dante can read from and write to across runs (#5)
2. An agent-loop node so workflows stop being fixed DAGs and start picking their own next move (#2)
3. A tool-server protocol so future integrations plug in by config, not code (#1)

Nothing user-visible ships in Phase 1 except a couple of hidden settings — it's plumbing. The success metric is: at the end of Phase 1, a Phase 2 PR adding Wealthbox is < 200 lines of code.

---

## 1. `dante_memory` — persistent memory store

### What it stores

Three classes of memory, all in one table:

| `kind`     | Example                                                  | Source                          |
|------------|----------------------------------------------------------|---------------------------------|
| `fact`     | "John Doe's wife is named Sarah; mentioned on 2026-03-12" | Agent extraction from calls/emails |
| `summary`  | Rolled-up notes for a contact ("last 90 days")           | Nightly cron over churn events + meetings |
| `episode`  | Raw transcript chunk, email body, meeting notes          | Direct ingest from sources       |

The split matters because *facts* are queried by structured filter (`subject_contact_id = X`), *summaries* are queried by structured filter + recency, and *episodes* are queried by vector similarity. One table, three access patterns.

### Schema

```sql
-- supabase/migrations/<TS>_add_dante_memory.sql

create extension if not exists vector;

create table dante_memory (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  kind            text not null check (kind in ('fact','summary','episode')),

  -- What this memory is about. Both nullable: workspace-level facts
  -- (e.g. "the firm's compliance policy on gifts") have no contact.
  subject_contact_id uuid references contacts(id) on delete cascade,
  subject_type    text,                                 -- 'contact','workspace','deal',...

  -- Provenance. Lets us delete every memory derived from a deleted
  -- email, retry extraction on a single source, etc.
  source_kind     text,                                 -- 'email','call','meeting','manual','workflow'
  source_id       text,                                 -- foreign id; type-tagged in app code

  content         text not null,                        -- the human-readable memory
  embedding       vector(1536),                         -- nullable; facts may skip embedding

  -- Lifecycle. confidence drops as evidence ages or contradicts;
  -- expires_at lets short-lived memories auto-prune (e.g. "in a
  -- meeting right now").
  confidence      real not null default 1.0,
  expires_at      timestamptz,
  superseded_by   uuid references dante_memory(id),     -- newer memory replaces this one

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index dante_memory_workspace_subject
  on dante_memory(workspace_id, subject_contact_id)
  where superseded_by is null;

create index dante_memory_workspace_kind
  on dante_memory(workspace_id, kind)
  where superseded_by is null;

create index dante_memory_embedding
  on dante_memory using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RLS: workspace-scoped, same pattern as dante_archive.
alter table dante_memory enable row level security;
create policy dante_memory_select on dante_memory for select
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
-- (insert/update/delete use service-role only — no direct UI writes)
```

### Why one table not three

Tempting to split (`memory_facts`, `memory_summaries`, `memory_episodes`) but:

- The agent node needs *one* retrieval call that mixes "what do you know about this contact" (fact + summary) with "what was said" (episode). Joining three tables every retrieval is worse than `where kind in (...)`.
- Lifecycle (supersession, confidence decay, source-based deletion) is identical across all three.
- `dante_archive` already exists for *uploaded documents* (Form ADV PDFs, etc.). Memory is for *derived* knowledge. Keeping memory as one table mirrors how `dante_archive` is one table for all kinds of source docs.

### Retrieval helper

Mirror the existing `searchArchive` API in [lib/dante/archive/search.ts](../lib/dante/archive/search.ts):

```ts
// lib/dante/memory/search.ts
export interface MemorySearchInput {
  workspaceId: string;
  query: string;                 // natural language; embedded for vector hits
  contactId?: string;            // narrow to one subject
  kinds?: Array<"fact"|"summary"|"episode">;  // default: all
  k?: number;                    // default 8, max 25
}

export interface MemoryHit {
  id: string;
  kind: "fact"|"summary"|"episode";
  content: string;
  source_kind: string | null;
  source_id: string | null;
  confidence: number;
  created_at: string;
  similarity?: number;           // null for non-embedded fact hits
}

export async function searchMemory(input: MemorySearchInput): Promise<MemoryHit[]>;
```

Implementation: hybrid search. Structured prefilter on `(workspace_id, subject_contact_id, kinds)`, then within that set rank by vector similarity (when an embedding exists) or by recency × confidence (for facts without embeddings). Same `dante_memory_search` RPC pattern as the archive one.

### Write helper

```ts
// lib/dante/memory/write.ts
export interface RememberInput {
  workspaceId: string;
  kind: "fact" | "summary" | "episode";
  content: string;
  subjectContactId?: string;
  sourceKind?: string;
  sourceId?: string;
  expiresAt?: Date;
  /**
   * If set, the new memory supersedes the given one. The old row's
   * `superseded_by` is set to the new id, so retrieval skips it
   * automatically without losing audit history.
   */
  supersedes?: string;
}

export async function remember(input: RememberInput): Promise<{ id: string }>;
```

Episodes are always embedded. Facts are embedded only if > 80 chars (a short fact like "wife: Sarah" is better matched structurally). Summaries always embedded.

### Lifecycle

- **Confidence decay** — nightly cron drops confidence by 0.02/day for `fact`s with no reinforcement; below 0.3 we hide them from retrieval (kept for audit).
- **Reinforcement** — when an inserted fact's content cosine-matches an existing fact > 0.92, supersede instead of duplicate, and bump confidence back to 1.0.
- **Source-cascade** — delete a `customer_email` row → all memories with `source_kind='email' and source_id=X` get superseded by null (effectively retired).

---

## 2. Agent-loop workflow node

### The "too scripted" problem

Today every Dante run is a fixed DAG. The advisor authoring a workflow has to know in advance: "first query clients, then for each one, if churn_score > 0.7, send_email". The model can fill in *content* but never *picks the next action*.

The agent node closes that gap: inside one node, the model loops `(observe → call_tool → observe → ...)` until it returns a final answer or hits a step cap. Tools available inside the loop are exactly the other workflow node types plus the memory store.

### Node type

Add to [workflow-types.ts](../lib/dante/workflow-types.ts):

```ts
export interface AgentStep extends BaseStep {
  type: "agent";
  config: {
    model?: string;                                // default gpt-4o
    system?: string;                               // role/persona prompt
    objective: string;                             // what to accomplish; templated
    /**
     * Which tool surfaces this agent may use. Each entry maps to a
     * concrete capability the runner exposes inside the loop.
     */
    tools: Array<
      | "memory.search"
      | "memory.write"
      | "archive.search"
      | "clients.query"
      | "clients.update"
      | "email.send"
      | "http.fetch"
      | { mcp: string }                            // MCP server name; Phase 2+
    >;
    max_steps?: number;                            // default 8, hard cap 20
    /**
     * Optional structured output. If set, the agent's final message
     * must validate against this JSON Schema, and the parsed object
     * is what shows up in {{steps.<id>.output}}.
     */
    output_schema?: object;
  };
}
```

### Tool-call contract (inner loop)

The runner translates each tool entry into a tool spec the model understands. We use the OpenAI tool-calling format because the existing `OpenAIStep` already speaks it. The loop is:

```
loop until done or max_steps:
  1. Send messages[] to model with tools[]
  2. Model returns either:
     a. Assistant message with tool_calls[]  → run each tool, append
        tool_result messages, continue
     b. Assistant message with content only  → done; that content is
        the step output (parsed against output_schema if set)
  3. If max_steps hit without (b), the runner forces a "summarize what
     you have" final pass and returns that with status='partial'.
```

Each tool maps to a small adapter that reuses existing code:

| Tool             | Adapter                                                       |
|------------------|---------------------------------------------------------------|
| `memory.search`  | `searchMemory()` — workspace-scoped automatically             |
| `memory.write`   | `remember()` with `source_kind='workflow'`, `source_id=run.id` |
| `archive.search` | `searchArchive()` from existing pipeline                      |
| `clients.query`  | The `query_clients` step's executor, called inline            |
| `clients.update` | The `update_contact` step's executor                          |
| `email.send`     | The `send_email` step's executor                              |
| `http.fetch`     | The `http` step's executor (with the same allowlist)          |
| `{ mcp: name }`  | Phase 2 — see §3                                              |

This is the key win: **no new tool implementations.** The agent node is plumbing on top of executors that already exist. The first PR is mostly the loop + JSON-schema validation + `memory.*`.

### Logging

Each tool call inside the loop becomes its own `StepLogEntry` with `step_id = "<agent-id>:<n>"`, so the run timeline view shows the agent's actual reasoning trace, not a black box. This is what makes "feels too scripted" stop feeling that way — advisors *see* the agent picking tools.

### Safety rails

- **`max_steps`** hard cap of 20. Above that the model is almost certainly looping.
- **Per-tool budgets** — `email.send` capped at 3 sends/run; `http.fetch` capped at 10. Configurable per workspace later.
- **Simulate mode** — when the workflow runs in simulate (existing flag), the agent runs the loop but mutating tools (`email.send`, `clients.update`, `memory.write`) return a fake "would have done X" result instead of actually running. Already how `send_email` step behaves in simulate; we just thread the flag through the adapters.

---

## 3. MCP tool scaffolding

Don't ship any MCP servers in Phase 1. Just register the *protocol* so Phase 2 (Wealthbox, Gmail, Calendar) can plug in trivially.

### What we adopt from MCP

The standard `tools/list` + `tools/call` JSON-RPC interface. We don't need MCP's *transport* layer (stdio/SSE) because we're calling out from a Vercel function — we just need the schema vocabulary.

### Storage

```sql
create table mcp_servers (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  name            text not null,                 -- 'wealthbox', 'gmail', ...
  url             text not null,                 -- HTTPS endpoint speaking MCP-over-HTTP
  auth            jsonb not null default '{}',   -- { kind: 'oauth'|'apikey', ... }
  enabled         boolean not null default true,
  /**
   * Cached tool catalog from the last tools/list call. Refreshed on
   * a 1h TTL or when the user clicks "Reconnect". Lets the agent
   * node populate its tools[] dropdown without round-tripping.
   */
  tools_catalog   jsonb not null default '[]',
  catalog_fetched_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (workspace_id, name)
);
```

### Client

```ts
// lib/mcp/client.ts
export async function listTools(server: McpServer): Promise<McpTool[]>;
export async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>
): Promise<McpToolResult>;
```

### What ships in Phase 1

- The migration above
- The client module
- A debug-only admin page to register a server and see `tools/list` output
- The agent node accepts `{ mcp: "<server_name>" }` entries in `tools[]` and the runner expands them via `listTools()` at run start

What does *not* ship: any actual server implementations, any UI for advisors to connect Wealthbox, anything that reaches an end user. Phase 2 builds the Wealthbox MCP server (a small Next.js route) and the connect-flow UI on top of this scaffolding.

---

## Migration order & PR plan

| PR | Title                                       | LoC est | Depends on |
|----|---------------------------------------------|---------|------------|
| 1  | `dante_memory` table + RLS + RPC            | ~250    | —          |
| 2  | `searchMemory` + `remember` helpers + tests | ~350    | PR 1       |
| 3  | Agent node type + runner integration        | ~600    | PR 2       |
| 4  | Per-tool budgets + simulate threading       | ~150    | PR 3       |
| 5  | `mcp_servers` table + client module         | ~300    | —          |
| 6  | Agent node accepts `{ mcp }` tool entries   | ~150    | PR 3, PR 5 |

Each PR is independently mergeable behind feature flags (`features.dante_memory`, `features.dante_agent_node`, `features.dante_mcp`). Default off in production until Phase 2 has a real reason to turn them on.

---

## Open questions

1. **Embedding model.** Archive uses `text-embedding-3-small` (1536-dim). Memory should match so we can later cross-search both stores in one query. Confirmed?
2. **Memory write authority.** Should *any* agent node be able to write to memory, or only ones explicitly granted `memory.write`? Leaning toward explicit — keeps surprise writes out of advisor-authored workflows. Default `tools` excludes `memory.write`.
3. **Cross-workspace facts.** Some facts are truly workspace-global ("our firm doesn't service crypto"). Today schema requires a `workspace_id`, which is correct. But how do we let an advisor *promote* a per-contact fact to workspace-level? Probably out of scope for Phase 1 — manual SQL is fine for now.
4. **Memory in briefs.** The dashboard brief currently reads from `briefs.ts`. Should Phase 1 also wire memory into briefs, or wait for Phase 2 when there's actually memory worth surfacing? Lean: wait. Briefs without memory still work; rewriting briefs with no memory yet would be premature.

---

## Success criteria

- A workspace with the flag on can run a workflow with one agent node, give it `objective="catch up on Adharsh Mannar before our meeting"`, watch it hit `memory.search` then `archive.search` then return a markdown summary.
- The Phase 2 Wealthbox PR adds a route file + a row in `mcp_servers` and Just Works inside any agent node — no runner changes.
- Every tool call inside the agent loop appears in the run-timeline UI as its own log entry with input + output visible.
