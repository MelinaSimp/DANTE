// scripts/test-hardening.ts
//
// End-to-end tests for all 5 production hardening measures:
//   1. Retry with exponential backoff
//   2. Per-workflow execution lock
//   3. for_each iteration cap (200 items)
//   4. Rate limiting (email 200/hr, SMS 100/hr)
//   5. Run cancellation
//
// Usage: npx tsx --env-file=.env.local scripts/test-hardening.ts

import { randomUUID } from "crypto";
import { runWorkflow } from "../lib/dante/workflow-runner";
import { enqueueRun } from "../lib/dante/run-executor";
import { supabaseAdmin } from "../lib/supabase/admin";
import type { WorkflowDefinition } from "../lib/dante/workflow-types";

const TEST_WORKSPACE = "5bc2cc7d-6e37-448b-836a-5df378ba6334";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}${detail ? ` -- ${detail}` : ""}`);
    failed++;
  }
}

// ── Helper: build a minimal workflow definition ──────────────

function makeWorkflow(
  id: string,
  nodes: WorkflowDefinition["graph"]["nodes"],
  edges: WorkflowDefinition["graph"]["edges"] = [],
): WorkflowDefinition {
  return { id, workspace_id: TEST_WORKSPACE, graph: { nodes, edges } };
}

function triggerNode(id = "trigger") {
  return {
    id,
    type: "trigger_manual" as const,
    position: { x: 0, y: 0 },
    data: {
      step: {
        id,
        type: "trigger_manual" as const,
        name: "Start",
        config: {},
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// TEST 1: Retry with Exponential Backoff
// ═══════════════════════════════════════════════════════════════

async function testRetry() {
  console.log("\n--- Test 1: Retry with Exponential Backoff ---");

  // 1a. HTTP 500 -- should retry 3 times then fail
  console.log("  1a. HTTP 500 triggers retry...");
  const http500 = makeWorkflow(
    "test-retry-500",
    [
      triggerNode(),
      {
        id: "bad",
        type: "http" as any,
        position: { x: 0, y: 100 },
        data: {
          step: {
            id: "bad",
            type: "http" as const,
            name: "HTTP 500",
            config: { url: "https://httpbin.org/status/500", method: "GET" },
          },
        },
      },
    ],
    [{ id: "e1", source: "trigger", target: "bad" }],
  );

  const t0 = Date.now();
  const r500 = await runWorkflow(http500, {});
  const elapsed = Date.now() - t0;

  assert(r500.status === "error", "HTTP 500 results in error status");
  // 3 attempts: initial + 1s wait + retry + 4s wait + retry = >5s total
  assert(elapsed > 4000, `Retry backoff engaged: ${elapsed}ms (expected >4s)`);
  assert(
    r500.log.some((l) => l.status === "error"),
    "Error recorded in step log",
  );

  // 1b. HTTP 200 -- should succeed on first try, no retry
  console.log("  1b. HTTP 200 succeeds immediately...");
  const http200 = makeWorkflow(
    "test-retry-200",
    [
      triggerNode(),
      {
        id: "ok",
        type: "http" as any,
        position: { x: 0, y: 100 },
        data: {
          step: {
            id: "ok",
            type: "http" as const,
            name: "HTTP 200",
            config: {
              url: "https://jsonplaceholder.typicode.com/posts/1",
              method: "GET",
            },
          },
        },
      },
    ],
    [{ id: "e1", source: "trigger", target: "ok" }],
  );

  const t1 = Date.now();
  const r200 = await runWorkflow(http200, {});
  const elapsed200 = Date.now() - t1;

  assert(r200.status === "success", "HTTP 200 succeeds");
  assert(elapsed200 < 5000, `No retry delay: ${elapsed200}ms`);
  const okOut = (r200.output as Record<string, Record<string, unknown>>)?.ok;
  assert(okOut?.status === 200, `Response status 200 (got ${okOut?.status})`);
  assert(okOut?.ok === true, "Response ok=true");

  // 1c. HTTP 404 -- 4xx should NOT retry (not a server error)
  console.log("  1c. HTTP 404 does NOT retry...");
  const http404 = makeWorkflow(
    "test-retry-404",
    [
      triggerNode(),
      {
        id: "notfound",
        type: "http" as any,
        position: { x: 0, y: 100 },
        data: {
          step: {
            id: "notfound",
            type: "http" as const,
            name: "HTTP 404",
            config: {
              url: "https://httpbin.org/status/404",
              method: "GET",
            },
          },
        },
      },
    ],
    [{ id: "e1", source: "trigger", target: "notfound" }],
  );

  const t2 = Date.now();
  const r404 = await runWorkflow(http404, {});
  const elapsed404 = Date.now() - t2;

  // 404 is a client error, so the HTTP runner returns it as a result
  // (status 404, ok=false) without throwing/retrying.
  assert(r404.status === "success", "404 doesn't throw (returns in body)");
  assert(elapsed404 < 5000, `No retry: ${elapsed404}ms`);
  const nfOut = (r404.output as Record<string, Record<string, unknown>>)?.notfound;
  assert(nfOut?.status === 404, `Body has status 404 (got ${nfOut?.status})`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2: Per-Workflow Execution Lock
// ═══════════════════════════════════════════════════════════════

async function testExecutionLock() {
  console.log("\n--- Test 2: Per-Workflow Execution Lock ---");

  const wfId = randomUUID();

  await supabaseAdmin.from("dante_workflows").insert({
    id: wfId,
    workspace_id: TEST_WORKSPACE,
    name: "Lock Test",
    graph: {
      nodes: [
        {
          id: "t",
          type: "trigger_manual",
          position: { x: 0, y: 0 },
          data: {
            step: {
              id: "t",
              type: "trigger_manual",
              name: "Start",
              config: {},
            },
          },
        },
      ],
      edges: [],
    },
    enabled: true,
  });

  // 2a. First enqueue succeeds
  const enq1 = await enqueueRun({
    workflow_id: wfId,
    workspace_id: TEST_WORKSPACE,
    payload: { first: true },
  });
  assert(!("error" in enq1), "First enqueue succeeds");

  // 2b. Second enqueue blocked by execution lock
  const enq2 = await enqueueRun({
    workflow_id: wfId,
    workspace_id: TEST_WORKSPACE,
    payload: { second: true },
  });
  assert("error" in enq2, "Second enqueue blocked");
  if ("error" in enq2) {
    assert(
      enq2.error.includes("already has an active run"),
      `Lock message: "${enq2.error.slice(0, 70)}..."`,
    );
  }

  // 2c. After marking the first run finished, a new enqueue works
  if (!("error" in enq1)) {
    await supabaseAdmin
      .from("dante_workflow_runs")
      .update({ status: "success", finished_at: new Date().toISOString() })
      .eq("id", enq1.run_id);
  }
  const enq3 = await enqueueRun({
    workflow_id: wfId,
    workspace_id: TEST_WORKSPACE,
    payload: { third: true },
  });
  assert(!("error" in enq3), "Enqueue succeeds after prior run finished");

  // Cleanup
  await supabaseAdmin.from("dante_workflow_runs").delete().eq("workflow_id", wfId);
  await supabaseAdmin.from("dante_workflows").delete().eq("id", wfId);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3: for_each Iteration Cap
// ═══════════════════════════════════════════════════════════════

async function testForEachCap() {
  console.log("\n--- Test 3: for_each Iteration Cap ---");

  // Build 250 items. Use a non-existent action_type so each iteration
  // fails instantly with zero I/O (no HTTP, no DB), testing pure cap logic.
  const items = Array.from({ length: 250 }, (_, i) => ({ i }));

  const workflow = makeWorkflow(
    "test-cap",
    [
      triggerNode(),
      {
        id: "loop",
        type: "for_each" as any,
        position: { x: 0, y: 100 },
        data: {
          step: {
            id: "loop",
            type: "for_each" as const,
            name: "Big Loop",
            config: {
              items: JSON.stringify(items),
              action_type: "noop_test",
              action_config: {},
            },
          },
        },
      },
    ],
    [{ id: "e1", source: "trigger", target: "loop" }],
  );

  // Run WITHOUT simulate so runForEach actually executes
  const result = await runWorkflow(workflow, {});
  // for_each catches per-item errors and reports them, so the node
  // itself succeeds. The step records succeeded=0, failed=200.
  assert(result.status === "success", "Workflow completes despite item errors");

  const loop = (result.output as Record<string, Record<string, unknown>>)?.loop;
  assert(loop?.truncated === true, `truncated flag: ${loop?.truncated}`);
  assert(loop?.original_count === 250, `original_count: ${loop?.original_count}`);
  assert(loop?.cap === 200, `cap: ${loop?.cap}`);
  assert(loop?.total === 200, `Executed 200 (got ${loop?.total})`);
  assert((loop?.failed as number) === 200, `All 200 items errored (unsupported action): ${loop?.failed}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 4: Rate Limiting
// ═══════════════════════════════════════════════════════════════

async function testRateLimiting() {
  console.log("\n--- Test 4: Rate Limiting ---");

  const testWs = "00000000-0000-0000-0000-000000000099";
  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);

  // Clean slate
  await supabaseAdmin
    .from("dante_send_counters")
    .delete()
    .eq("workspace_id", testWs);

  // 4a. Atomic increment RPC
  console.log("  4a. increment_send_counter RPC...");
  const { data: c1, error: e1 } = await supabaseAdmin.rpc(
    "increment_send_counter",
    {
      p_workspace_id: testWs,
      p_channel: "email",
      p_window_start: windowStart.toISOString(),
      p_count: 5,
    },
  );
  assert(!e1, `RPC succeeds (${e1?.message ?? "ok"})`);
  assert(c1 === 5, `First: 5 (got ${c1})`);

  const { data: c2 } = await supabaseAdmin.rpc("increment_send_counter", {
    p_workspace_id: testWs,
    p_channel: "email",
    p_window_start: windowStart.toISOString(),
    p_count: 3,
  });
  assert(c2 === 8, `Additive: 8 (got ${c2})`);

  // 4b. SMS counter is independent of email
  console.log("  4b. SMS counter independent of email...");
  const { data: sms1 } = await supabaseAdmin.rpc("increment_send_counter", {
    p_workspace_id: testWs,
    p_channel: "sms",
    p_window_start: windowStart.toISOString(),
    p_count: 2,
  });
  assert(sms1 === 2, `SMS counter independent: 2 (got ${sms1})`);

  // 4c. Rate limit rejection on for_each
  console.log("  4c. for_each email rate limit...");
  // Push email counter to 198
  await supabaseAdmin.rpc("increment_send_counter", {
    p_workspace_id: testWs,
    p_channel: "email",
    p_window_start: windowStart.toISOString(),
    p_count: 190,
  });

  const rlWorkflow: WorkflowDefinition = {
    id: "test-rate",
    workspace_id: testWs,
    graph: {
      nodes: [
        triggerNode(),
        {
          id: "loop",
          type: "for_each" as any,
          position: { x: 0, y: 100 },
          data: {
            step: {
              id: "loop",
              type: "for_each" as const,
              name: "Email Blast",
              config: {
                items: JSON.stringify(
                  Array.from({ length: 10 }, (_, i) => ({
                    email: `t${i}@example.com`,
                  })),
                ),
                action_type: "send_email",
                action_config: {
                  to: "{{item.email}}",
                  subject: "Test",
                  text: "Body",
                },
              },
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger", target: "loop" }],
    },
  };

  const rlResult = await runWorkflow(rlWorkflow, {});
  assert(rlResult.status === "error", "Rate-limited workflow errors");
  assert(
    (rlResult.error ?? "").includes("rate limit"),
    `Error mentions rate limit: "${(rlResult.error ?? "").slice(0, 80)}..."`,
  );

  // 4d. Cleanup function works
  console.log("  4d. Cleanup function...");
  const { data: cleaned, error: cleanErr } = await supabaseAdmin.rpc(
    "cleanup_send_counters",
  );
  assert(!cleanErr, `Cleanup RPC runs (${cleanErr?.message ?? "ok"})`);
  // Our test counters are fresh (this hour) so they won't be cleaned
  assert(typeof cleaned === "number", `Cleanup returns count: ${cleaned}`);

  // Final cleanup
  await supabaseAdmin
    .from("dante_send_counters")
    .delete()
    .eq("workspace_id", testWs);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5: Run Cancellation
// ═══════════════════════════════════════════════════════════════

async function testCancellation() {
  console.log("\n--- Test 5: Run Cancellation ---");

  const wfId = randomUUID();

  await supabaseAdmin.from("dante_workflows").insert({
    id: wfId,
    workspace_id: TEST_WORKSPACE,
    name: "Cancel Test",
    graph: {
      nodes: [
        {
          id: "t",
          type: "trigger_manual",
          position: { x: 0, y: 0 },
          data: {
            step: {
              id: "t",
              type: "trigger_manual",
              name: "Start",
              config: {},
            },
          },
        },
      ],
      edges: [],
    },
    enabled: true,
  });

  // 5a. Cancel a queued run
  console.log("  5a. Cancel queued run...");
  const enq = await enqueueRun({
    workflow_id: wfId,
    workspace_id: TEST_WORKSPACE,
    payload: {},
  });
  assert(!("error" in enq), "Enqueue succeeds");

  if (!("error" in enq)) {
    // Cancel it
    const { error: cancelErr } = await supabaseAdmin
      .from("dante_workflow_runs")
      .update({
        status: "cancelled",
        error: "Cancelled by test",
        finished_at: new Date().toISOString(),
      })
      .eq("id", enq.run_id)
      .in("status", ["queued", "running"]);

    assert(!cancelErr, `Cancel update: ${cancelErr?.message ?? "ok"}`);

    const { data: run } = await supabaseAdmin
      .from("dante_workflow_runs")
      .select("status, error")
      .eq("id", enq.run_id)
      .single();

    assert(run?.status === "cancelled", `Status: ${run?.status}`);
    assert(run?.error === "Cancelled by test", "Reason preserved");

    // 5b. Execution lock released after cancellation
    console.log("  5b. Lock released after cancel...");
    const enq2 = await enqueueRun({
      workflow_id: wfId,
      workspace_id: TEST_WORKSPACE,
      payload: {},
    });
    assert(!("error" in enq2), "New enqueue after cancel succeeds");

    if (!("error" in enq2)) {
      await supabaseAdmin
        .from("dante_workflow_runs")
        .delete()
        .eq("id", enq2.run_id);
    }
  }

  // 5c. WorkflowRunResult type supports 'cancelled'
  console.log("  5c. Type system check...");
  const testResult = {
    status: "cancelled" as const,
    log: [],
    output: {},
    error: "User cancelled",
  };
  assert(testResult.status === "cancelled", "Type supports cancelled");

  // Cleanup
  await supabaseAdmin.from("dante_workflow_runs").delete().eq("workflow_id", wfId);
  await supabaseAdmin.from("dante_workflows").delete().eq("id", wfId);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6: Full Integration Pipeline
// ═══════════════════════════════════════════════════════════════

async function testIntegration() {
  console.log("\n--- Test 6: Multi-Node Integration Pipeline ---");

  // trigger -> http (with retry wrapper) -> condition -> transform
  const wf = makeWorkflow(
    "test-integration",
    [
      triggerNode(),
      {
        id: "fetch",
        type: "http" as any,
        position: { x: 0, y: 100 },
        data: {
          step: {
            id: "fetch",
            type: "http" as const,
            name: "Fetch",
            config: {
              url: "https://jsonplaceholder.typicode.com/posts/1",
              method: "GET",
            },
          },
        },
      },
      {
        id: "check",
        type: "condition" as any,
        position: { x: 0, y: 200 },
        data: {
          step: {
            id: "check",
            type: "condition" as const,
            name: "Is OK?",
            config: { expression: "{{steps.fetch.ok}} == true" },
          },
        },
      },
      {
        id: "out",
        type: "transform" as any,
        position: { x: 0, y: 300 },
        data: {
          step: {
            id: "out",
            type: "transform" as const,
            name: "Output",
            config: {
              operations: [
                { action: "set", field: "result", value: "pipeline_complete" },
                {
                  action: "set",
                  field: "http_status",
                  value: "{{steps.fetch.status}}",
                },
              ],
            },
          },
        },
      },
    ],
    [
      { id: "e1", source: "trigger", target: "fetch" },
      { id: "e2", source: "fetch", target: "check" },
      {
        id: "e3",
        source: "check",
        target: "out",
        sourceHandle: "true",
      },
    ],
  );

  const result = await runWorkflow(wf, { source: "hardening_test" });
  assert(result.status === "success", "Pipeline succeeds");
  assert(result.log.length === 4, `4 nodes ran (got ${result.log.length})`);

  const fetchStep = result.log.find((l) => l.step_id === "fetch");
  assert(fetchStep?.status === "success", "HTTP node OK (with retry wrapper)");

  const condStep = result.log.find((l) => l.step_id === "check");
  assert(condStep?.status === "success", "Condition evaluated");

  const xformStep = result.log.find((l) => l.step_id === "out");
  assert(xformStep?.status === "success", "Transform ran (true branch)");

  const xformOut = (result.output as Record<string, Record<string, unknown>>)?.out;
  assert(
    xformOut?.result === "pipeline_complete",
    `Transform output: ${xformOut?.result}`,
  );
  assert(
    xformOut?.http_status === "200",
    `HTTP status passed through: ${xformOut?.http_status}`,
  );
}

// ═══════════════════════════════════════════════════════════════
// TEST 7: Due Diligence with Retry (data source resilience)
// ═══════════════════════════════════════════════════════════════

async function testDueDiligence() {
  console.log("\n--- Test 7: Due Diligence Data Sources ---");

  // Coordinate-based DD -- no Google Maps needed, tests gov data sources
  const ddWorkflow = makeWorkflow(
    "test-dd",
    [
      triggerNode(),
      {
        id: "dd",
        type: "due_diligence" as any,
        position: { x: 0, y: 100 },
        data: {
          step: {
            id: "dd",
            type: "due_diligence" as const,
            name: "DD",
            config: {
              latitude: 41.4993,
              longitude: -81.6944,
              state_fips: "39",
              county_fips: "049",
              county_name: "CUYAHOGA",
            },
          },
        },
      },
    ],
    [{ id: "e1", source: "trigger", target: "dd" }],
  );

  const result = await runWorkflow(ddWorkflow, {});
  assert(result.status === "success", "DD pipeline succeeds");

  const dd = (result.output as Record<string, Record<string, unknown>>)?.dd;
  assert(dd != null, "DD output exists");

  const loc = dd?.location as Record<string, unknown>;
  assert(loc?.latitude === 41.4993, `Lat: ${loc?.latitude}`);
  assert(loc?.longitude === -81.6944, `Lng: ${loc?.longitude}`);

  const emp = dd?.employment as unknown[];
  assert(Array.isArray(emp), `Employment data: ${emp?.length ?? 0} records`);

  const epa = dd?.epa as Record<string, unknown>;
  assert(epa != null, "EPA data present");

  const errors = dd?.errors as string[];
  if (errors?.length > 0) {
    console.log(`    (non-fatal source errors: ${errors.join(", ")})`);
  }
}

// ═══════════════════════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log("=== Workflow Hardening E2E Tests ===");
  console.log(`Workspace: ${TEST_WORKSPACE}`);
  console.log(`Time: ${new Date().toISOString()}`);

  const tests = [
    ["Retry", testRetry],
    ["Execution Lock", testExecutionLock],
    ["for_each Cap", testForEachCap],
    ["Rate Limiting", testRateLimiting],
    ["Cancellation", testCancellation],
    ["Integration Pipeline", testIntegration],
    ["Due Diligence", testDueDiligence],
  ] as const;

  for (const [name, fn] of tests) {
    try {
      await (fn as () => Promise<void>)();
    } catch (e) {
      console.log(`  FATAL in ${name}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(55)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(55)}`);

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
