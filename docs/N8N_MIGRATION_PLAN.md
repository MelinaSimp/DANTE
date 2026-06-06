# Drift Workflow Engine: n8n Backend Migration Plan

**Status**: Phase 2 in progress (2026-06-06)
**Owner**: Drift AI engineering
**Timeline**: 8 weeks (padded from 6 per board recommendation)

### Progress

- **Phase 0** (Infrastructure): COMPLETE
  - n8n bridge, types, callback endpoint, database migration, 3 initial custom nodes
- **Phase 1** (Dante Bridge + Observability): COMPLETE
  - n8n workflow AI generator, agent tool updates (propose/run/status/update/clone),
    5 templates converted, per-node execution traces in frontend, API routing,
    health check endpoint, parallel operation with legacy engine
- **Phase 2** (Full Migration): IN PROGRESS
  - [x] All 12 custom CRE nodes complete
  - [x] Auto-converter (n8n-converter.ts) for legacy templates
  - [x] Auto-converter integrated into clone_template flow
  - [x] Migration utility (n8n-migration.ts) with validation gate
  - [x] Migration API endpoint (POST /api/dante/n8n/migrate)
  - [x] workflow.migrate agent tool (owner-only, dry-run support)
  - [x] Frontend migration panel with dry-run/migrate controls
  - [x] Engine badge (n8n/legacy) on workflow rows
  - [x] Cron tick skips n8n-migrated workflows (no duplicate scheduling)
  - [x] Queue tick skips n8n-owned runs
  - [x] Migration reports sent to workspace admins via Resend
  - [ ] End-to-end validation with live n8n instance

---

## Executive Summary

Replace Drift's custom workflow DAG executor (~6,700 LOC in `lib/dante/workflow-*.ts`) with a self-hosted n8n instance as the execution backend. Drift retains full control of the user experience: Dante generates n8n-compatible workflow JSON via the n8n REST API, and the Drift frontend renders a branded read/manage view on top of n8n's stored workflows. The custom runner, its cron tick, its queue, and its sandbox are retired. n8n handles execution, retries, scheduling, webhooks, and error handling.

Drift owns the entire support relationship. n8n is invisible infrastructure. No user ever sees or hears the word "n8n."

---

## 1. Infrastructure

**Self-hosted n8n on Railway.**

- Docker container running n8n with Postgres (dedicated Railway Postgres instance)
- Redis for queue mode (enables horizontal scaling via workers)
- Environment: `N8N_ENCRYPTION_KEY`, `DB_TYPE=postgresdb`, `WEBHOOK_URL=https://n8n.driftai.studio`, `N8N_BASIC_AUTH_ACTIVE=true`
- Custom subdomain: `n8n.driftai.studio` (reverse-proxied, admin-only, never exposed to end users)
- Co-located in US East to minimize latency from Vercel (iad1)

**Cost**: Railway usage-based. At current scale, ~$30-80/month. At 10K executions/day with workers, ~$200/month. An order of magnitude cheaper than maintaining a custom engine.

**Why not Vercel**: n8n is a long-running Node.js process with persistent connections, cron scheduling, and worker queues. It cannot run in serverless functions. This also eliminates the 300-second Vercel ceiling that constrained the current runner.

**Licensing**: n8n is source-available under Sustainable Use License. Free for internal use. Drift is the operator, not reselling n8n. We pin the version and self-host. Worst case (license change, project abandonment): fork at last compatible version. The workflow JSON format is stable, the custom nodes are ours, and the bridge layer is a thin HTTP wrapper.

---

## 2. CRE Custom Node Package

Build `n8n-nodes-drift-cre` -- a community-style node package giving n8n access to Drift's data and CRE-specific operations.

### Step Type Mapping

**14 steps covered by built-in n8n nodes (no custom code):**

| Current Step Type | n8n Equivalent |
|---|---|
| trigger_manual | Manual Trigger |
| trigger_cron | Cron/Schedule Trigger |
| trigger_at | Schedule Trigger |
| trigger_webhook | Webhook |
| http | HTTP Request |
| openai | OpenAI |
| code | Code |
| condition | IF |
| switch | Switch |
| delay | Wait |
| for_each | SplitInBatches |
| transform | Code |
| send_email | Send Email / SMTP |
| send_sms | Twilio |
| sub_workflow | Execute Workflow |

**11 custom CRE nodes to build:**

| Node | Purpose |
|---|---|
| DriftQueryContacts | Query contacts by workspace with filters |
| DriftUpdateContact | Update contact fields, add timeline entries |
| DriftQueryProperties | Query properties with spatial/attribute filters |
| DriftQueryListings | Query active listings with market filters |
| DriftQueryOffers | Query offers by deal, status, counterparty |
| DriftLeaseLookup | Search lease abstractions by tenant, expiry, terms |
| DriftVaultSearch | Vector + keyword search across vault documents |
| DriftWebSearch | Tavily web search with CRE context |
| DriftDueDiligence | Run due diligence checks against property/entity |
| DriftGenerateDocument | Generate documents from templates with deal data |
| DriftAiAgent | Invoke Dante's AI reasoning within a workflow step |
| DriftApprovalGate | Pause workflow, send approval email/SMS, resume on callback |

### Package Structure

```
n8n-nodes-drift-cre/
  package.json                # name: "n8n-nodes-drift-cre"
  credentials/
    DriftCreApi.credentials.ts      # workspace API key + Supabase URL
  nodes/
    DriftQueryContacts/DriftQueryContacts.node.ts
    DriftUpdateContact/DriftUpdateContact.node.ts
    DriftQueryProperties/DriftQueryProperties.node.ts
    DriftQueryListings/DriftQueryListings.node.ts
    DriftQueryOffers/DriftQueryOffers.node.ts
    DriftLeaseLookup/DriftLeaseLookup.node.ts
    DriftVaultSearch/DriftVaultSearch.node.ts
    DriftWebSearch/DriftWebSearch.node.ts
    DriftDueDiligence/DriftDueDiligence.node.ts
    DriftGenerateDocument/DriftGenerateDocument.node.ts
    DriftAiAgent/DriftAiAgent.node.ts
    DriftApprovalGate/DriftApprovalGate.node.ts
```

Custom nodes authenticate to Drift's Supabase using a workspace-scoped API key stored as an n8n credential type (`driftCre`). Each node makes direct Supabase RPC calls scoped by RLS.

The approval gate uses n8n's `waitTill` mechanism: pauses execution, sends the approval email/SMS with a callback URL, and resumes when the webhook fires. Can wait indefinitely (state persisted to Postgres, no in-memory state held).

Each custom node is unit-testable with mock data using n8n's test framework (pin input data, run node, assert output). The package has its own test suite independent of Drift's vitest suite. CI runs both.

---

## 3. Dante-to-n8n API Bridge

New module: `lib/dante/n8n-bridge.ts`

Wraps the n8n REST API (`/api/v1`). Authentication via `X-N8N-API-KEY` header stored in Drift environment variables (infra config, not user data).

### API Surface

```typescript
class N8nBridge {
  // Workflow lifecycle
  createWorkflow(json: N8nWorkflowJSON): Promise<string>
  updateWorkflow(id: string, json: N8nWorkflowJSON): Promise<void>
  deleteWorkflow(id: string): Promise<void>
  activateWorkflow(id: string): Promise<void>
  deactivateWorkflow(id: string): Promise<void>
  getWorkflow(id: string): Promise<N8nWorkflowJSON>
  listWorkflows(tags?: string[]): Promise<N8nWorkflowSummary[]>

  // Execution -- dual modes per board requirement
  executeAsync(id: string, data?: Record<string, unknown>): Promise<string>
    // Webhook trigger. Returns execution ID immediately.
    // Results pushed to Drift via "Report to Drift" final node.
    // Use for: background workflows (lease alerts, drip campaigns)

  executeSync(id: string, data?: Record<string, unknown>): Promise<N8nExecutionResult>
    // API trigger with includeData=true. Waits for completion.
    // Returns full per-node output.
    // Use for: workflows where Dante needs the result to respond
    //          (deal scoring, document generation, analysis)

  // Execution queries
  getExecution(id: string, includeData?: boolean): Promise<N8nExecution>
  listExecutions(workflowId?: string, status?: string): Promise<N8nExecution[]>
  retryExecution(id: string): Promise<void>
  stopExecution(id: string): Promise<void>

  // Tags (workspace isolation)
  createTag(name: string): Promise<string>
  listTags(): Promise<N8nTag[]>
}
```

### Workspace Isolation

Each Drift workspace gets an n8n tag (`workspace:<id>`). All workflows carry the tag. All queries filter by tag. Credentials scoped per workspace.

Phase 1: single workspace (trivially simple).
Multi-workspace: evaluate n8n Projects (enterprise RBAC) or one-n8n-per-workspace if hard credential isolation is required.

### Timeout and Retry

Bridge calls to n8n timeout at 10 seconds with one retry. For `executeSync`, timeout scales with expected workflow duration (configurable per call, max 120s).

---

## 4. Push-Based Execution Reporting

**Board requirement**: Webhook callbacks from n8n to Drift, not poll-only.

### Architecture

Every workflow generated by Dante includes a mandatory final node: **"Report to Drift"** (an HTTP Request node). This node POSTs execution results to `POST /api/dante/n8n/execution-callback`:

```
{
  "n8n_execution_id": "...",
  "n8n_workflow_id": "...",
  "status": "success" | "error",
  "started_at": "...",
  "finished_at": "...",
  "result_summary": { ... },
  "error_message": "..." // if failed
}
```

Drift's callback endpoint writes to `dante_workflow_runs` and triggers any UI notifications.

Additionally, an n8n Error Trigger workflow catches all execution failures and POSTs to the same callback endpoint with `status: "error"`.

**Poll as fallback only**: `n8nBridge.listExecutions()` is used for dashboard views and stale-data recovery, not as the primary status mechanism.

---

## 5. Workflow AI Rewrite (generateWorkflow)

The current `lib/dante/workflow-ai.ts` SYSTEM_PROMPT teaches Claude to generate Drift's custom graph JSON. It gets rewritten to generate n8n workflow JSON.

### Key Changes

- **Node format**: from `{ id, type, label, config, position }` to `{ id, name, type, typeVersion, position, parameters, credentials }`
- **Connection format**: from adjacency list to n8n's `connections` object (`{ "SourceNode": { "main": [[ { "node": "TargetNode", "type": "main", "index": 0 } ]] } }`)
- **Step types**: mapped to n8n node types (e.g., `query_clients` becomes `n8n-nodes-drift-cre.driftQueryContacts`)
- **Built-in nodes**: used directly (e.g., `n8n-nodes-base.if`, `n8n-nodes-base.httpRequest`)
- **Mandatory final node**: every generated workflow includes the "Report to Drift" HTTP Request node
- **Working examples**: prompt includes valid n8n workflow JSON with Drift CRE custom nodes

### Dante Agent Tool Changes

**`workflow.propose`** (agent.ts ~line 2359):
1. Dante calls `generateWorkflow()` which returns n8n-format JSON
2. Calls `n8nBridge.createWorkflow()` with `active: false` (proposal = inactive)
3. Stores the n8n workflow ID in `dante_workflows.n8n_workflow_id`
4. On user approval, calls `n8nBridge.activateWorkflow()`

**`workflow.run`** (agent.ts ~line 2446):
1. Looks up `n8n_workflow_id` from `dante_workflows`
2. Calls `n8nBridge.executeAsync()` for background workflows or `n8nBridge.executeSync()` when Dante needs the result
3. Returns execution status/results to the user

**`workflow.clone_template`** (agent.ts ~line 2571):
1. Reads template JSON from `lib/dante/n8n-templates/`
2. Calls `n8nBridge.createWorkflow()` with workspace tag
3. Stores reference in `dante_workflows`

---

## 6. Template Migration

All 33 CRE templates in `lib/dante/templates.ts` (2,171 LOC) get reformatted as n8n workflow JSON.

- One-time conversion script takes each template's graph definition and outputs n8n format
- Converted templates stored as static JSON in `lib/dante/n8n-templates/`
- `workflow.clone_template` creates an n8n workflow from the template JSON, tags it with the workspace

### Validation Gate (Board Requirement)

Every template undergoes dry-run comparison:
1. Execute on the old engine with test input
2. Execute the converted n8n version with identical input
3. Diff outputs
4. Template only ships when outputs match

This is a **blocking gate** for Phase 2 completion. No template is deployed until validated.

---

## 7. Frontend

The Drift frontend at `/dante/workflows` becomes a read/manage layer over n8n. The n8n UI is admin-only and never shown to users.

### What the frontend shows

- Workflow list (via `n8nBridge.listWorkflows()` filtered by workspace tag)
- Workflow status (active/inactive)
- Execution history (via `n8nBridge.listExecutions()` + push callbacks)
- **Per-node execution traces** (via `n8nBridge.getExecution(id, includeData=true)`) -- ships in Phase 1 per board requirement
- Branded canvas view rendering n8n workflow JSON as a visual graph (React Flow, Drift-themed components)

### What the frontend does NOT do (Phase 1)

- Visual drag-and-drop editing of workflows. Phase 1 is read-only visualization. Dante handles all creation/modification via natural language. Phase 2 adds direct canvas editing that writes back to n8n.

### File Changes

| File | LOC | Change |
|---|---|---|
| WorkflowEditorClient.tsx | 2,595 | Read n8n JSON instead of Drift graph format. Map n8n node types to Drift-themed components. Render per-node execution traces. |
| DanteWorkflowsClient.tsx | 524 | Data source from Supabase direct queries to `n8nBridge.listWorkflows()` |
| StepConfigForm.tsx | 886 | Phase 2 only. Map n8n node parameters to form fields |
| DanteNode.tsx | 380 | Re-skinned to render n8n node types with neumorphic design |
| nodeTypes.ts | 276 | Maps n8n type strings to React Flow node components |

---

## 8. Database Migration

### Tables that stay (repurposed)

- **`dante_workflows`**: keeps `id`, `workspace_id`, `name`, `tags`. Adds `n8n_workflow_id TEXT` column. Becomes the Drift-side reference table. The actual workflow definition lives in n8n's Postgres.
- **`dante_workflow_runs`**: populated by push callbacks from n8n (primary) and API polling (fallback). Stores execution summaries for the Drift UI.

### Tables deprecated (Phase 3 removal)

| Table | Reason |
|---|---|
| `dante_workflow_versions` | n8n handles versioning internally |
| `dante_webhook_tokens` | n8n manages its own webhook URLs |
| `dante_approval_tokens` | Replaced by n8n waitTill + webhook callback |
| `dante_secrets` | Credentials move to n8n's encrypted credential store |
| `dante_workflow_step_cache` | n8n handles execution state |
| `dante_pending_nudges` | Handled by n8n Wait nodes + webhook callbacks |

### New Migration

```sql
ALTER TABLE dante_workflows ADD COLUMN n8n_workflow_id TEXT;
CREATE INDEX idx_workflows_n8n_id ON dante_workflows(n8n_workflow_id);
```

---

## 9. Migration Validation Protocol

**Board requirement**: Mandatory dry-run comparison for every migrated workflow and template.

### Per-Workflow Validation

1. Capture the workflow's last 3 successful execution inputs from `dante_workflow_runs`
2. Execute on old engine with captured inputs, record outputs
3. Execute the n8n version with identical inputs, record outputs
4. Diff outputs field-by-field
5. Pass: outputs match within tolerance (timestamps, IDs allowed to differ)
6. Fail: any semantic divergence blocks migration

### Per-Template Validation

Same protocol, using synthetic test inputs crafted per template type.

### Migration Report (Board Requirement)

The migration script produces a per-workflow report sent to the workspace admin:
- Workflow name and ID
- Original status (active/inactive)
- Migration status (migrated/failed/skipped)
- Dry-run result (pass/fail)
- Any discrepancies found
- New n8n workflow ID

Report appears in the Drift dashboard and is emailed to the workspace admin.

### Blocking Gate

Phase 2 cannot complete until all active workflows pass validation. Failed workflows remain on the old engine until fixed.

---

## 10. Phased Rollout

### Phase 0: Infrastructure (Week 1)

- Deploy n8n on Railway with Postgres + Redis
- Configure `n8n.driftai.studio` subdomain and SSL
- Build `n8n-bridge.ts` with full API surface
- Install `n8n-nodes-drift-cre` package (start with 3 nodes: QueryContacts, VaultSearch, ApprovalGate)
- Verify CRUD operations work end-to-end from Vercel
- Build the execution callback endpoint (`POST /api/dante/n8n/execution-callback`)
- Set up n8n Error Trigger workflow for failure reporting

### Phase 1: Dante Bridge + Observability (Week 2-4)

- Rewrite `generateWorkflow()` SYSTEM_PROMPT to output n8n JSON
- Update `workflow.propose` to create workflows via n8n API
- Update `workflow.run` to trigger n8n executions (both async and sync modes)
- Convert 5 highest-value templates to n8n format with validation
- Run both engines in parallel: new workflows go to n8n, old workflows keep running on the custom engine
- **Per-node execution traces in frontend** (ships in Phase 1, not Phase 2)
- Push-based execution reporting via "Report to Drift" final node

### Phase 2: Full Migration (Week 5-6)

- Complete all 11 custom CRE nodes
- Convert remaining 28 templates with per-template validation
- Migrate existing active workflows with per-workflow validation
- **Migration validation gate**: all active workflows must pass dry-run comparison
- Generate and send migration reports to workspace admins
- Frontend refactor: workflow list, execution history, and canvas visualization all read from n8n
- Deprecate the cron tick route (`app/api/dante/cron/tick/route.ts`)
- Deprecate the queue tick route (`app/api/dante/queue/tick/route.ts`)

### Phase 3: Cleanup (Week 7-8)

- Remove `workflow-runner.ts` (2,464 LOC)
- Remove `workflow-cache.ts` (225 LOC)
- Remove `workflow-errors.ts` (115 LOC)
- Archive deprecated database tables
- Remove 22 API routes now proxied through the bridge
- Final validation sweep
- Total code removed: ~5,500 LOC of custom execution logic

**2-week buffer** (weeks 7-8) absorbs validation overruns from Phase 2. If Phase 2 completes clean, Phase 3 cleanup starts early.

---

## 11. Rollback Plan

During Phase 1-2, the old engine remains fully operational. Rollback means:
1. Stop sending new workflows to n8n
2. Revert Dante tools to old code path
3. Continue on custom engine

Old code is not deleted until Phase 3. If Phase 3 rollback is needed, workflow JSON in n8n can be converted back to Drift format (the bridge is bidirectional by design).

---

## 12. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| n8n REST API latency from Vercel to Railway | Medium | Co-locate in US East. Cache workflow metadata in Supabase. Timeout 10s with retry. |
| n8n license terms change | Low | Pin version, self-host. Fork at last compatible version if needed. |
| Credential isolation between workspaces | High | Phase 1: single workspace. Multi-workspace: evaluate n8n Projects or one-instance-per-workspace. |
| Custom node bugs crashing n8n | Medium | Nodes run in n8n's sandboxed execution. Errors caught per-node, surfaced as execution failures, not process crashes. |
| Data loss during migration | High | Parallel engines during Phase 1-2. Mandatory validation gate. No old workflow deleted until verified on n8n. |
| Vercel to n8n network partition | Medium | Push callbacks are durable (n8n retries). Poll fallback for stale data. Frontend shows "checking status" rather than false failures. |
| User confusion during transition | Low | Users interact with Dante, not the engine. Same natural-language interface, same branded UI. The engine swap is invisible. |
| Template conversion produces semantic drift | High | Dry-run comparison with identical inputs. Blocking gate: no template ships until outputs match. |
| Migration overruns timeline | Medium | 2-week buffer built into schedule. Phase 3 cleanup deferred if needed. Old engine remains operational. |

---

## 13. Files Affected

### New Files

| Path | Purpose |
|---|---|
| `lib/dante/n8n-bridge.ts` | n8n REST API wrapper |
| `lib/dante/n8n-types.ts` | TypeScript types for n8n workflow JSON |
| `lib/dante/n8n-templates/*.json` | 33 converted CRE templates |
| `app/api/dante/n8n/execution-callback/route.ts` | Push callback endpoint |
| `n8n-nodes-drift-cre/` | Custom node package (separate repo or monorepo subdir) |
| `scripts/migrate-workflows-to-n8n.ts` | One-time migration script with validation |
| `scripts/validate-template.ts` | Template dry-run comparison tool |

### Modified Files

| Path | Change |
|---|---|
| `lib/dante/workflow-ai.ts` | SYSTEM_PROMPT rewrite for n8n JSON output |
| `lib/dante/agent.ts` | workflow.propose, workflow.run, workflow.clone_template retargeted to n8n bridge |
| `app/dante/workflows/DanteWorkflowsClient.tsx` | Data source to n8n bridge |
| `app/dante/workflows/[workflowId]/WorkflowEditorClient.tsx` | Render n8n JSON + execution traces |
| `app/dante/workflows/[workflowId]/canvas/DanteNode.tsx` | n8n node type rendering |
| `app/dante/workflows/[workflowId]/canvas/nodeTypes.ts` | n8n type mapping |
| `app/dante/workflows/health/page.tsx` | Execution data from n8n |

### Deleted Files (Phase 3)

| Path | LOC |
|---|---|
| `lib/dante/workflow-runner.ts` | 2,464 |
| `lib/dante/workflow-cache.ts` | 225 |
| `lib/dante/workflow-errors.ts` | 115 |
| `lib/dante/workflow-runner.test.ts` | 167 |
| `lib/dante/workflow-cache.test.ts` | 114 |
| 22 API routes in `app/api/dante/workflows/` | ~2,700 |
| `app/api/dante/cron/tick/route.ts` | 440 |
| `app/api/dante/queue/tick/route.ts` | ~100 |
| **Total** | **~6,325** |

---

## 14. Success Criteria

- All 33 templates converted and validated via dry-run comparison
- All active workflows migrated with per-workflow validation report
- Zero user-facing downtime during migration
- Per-node execution traces visible in frontend
- Push-based execution reporting operational (< 5s from completion to UI update)
- Custom engine code removed (Phase 3)
- No user ever encounters the word "n8n" in any Drift interface
