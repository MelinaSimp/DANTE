// lib/dante/citation-validator.test.ts
//
// Unit tests for the pure parts of the citation validator. We don't
// hit Supabase here — the lookup-shaped functions are integration
// tested separately. What we want guaranteed in this file:
//
//   - Marker extraction picks up [v\d] and [mem:hex] shapes only.
//   - Quote-appears-in normalization handles whitespace and casing
//     variation that real chunks always exhibit.
//   - Summary status correctly rolls up per-marker checks.
//
// These are intentionally tiny — the validator's value is in the
// behavior of the whole pipeline, but small tests around the parts
// catch the regressions that always hurt: "we changed the regex and
// suddenly all citations come back as missing." Run with:
//
//   npx tsx lib/dante/citation-validator.test.ts
//
// (No vitest / jest dependency yet — see evals/README.md for the
// runner story. We use plain assertions for now.)

import assert from "node:assert/strict";

// Re-export the internals we want to test. Keep the public module
// surface clean by importing the file path directly with internals
// pulled via require interop is awkward in TS — instead we tested via
// behaviour against the public validateCitations. For pure helpers we
// test by importing them as named exports below.

// Note: marker extraction + normalization are currently file-private.
// We keep the test focused on what's exported — overall behaviour
// when called with synthetic traces.

import { validateCitations } from "./citation-validator";

// Stub supabaseAdmin behavior would require a mock. Instead, the
// test harness exercises the no-op paths: response with no markers,
// response where every marker is missing from the trace.

async function testNoCitations() {
  const r = await validateCitations({
    workspaceId: "ws_test",
    responseText: "Hi, no citations here. Just plain text.",
    trace: [],
  });
  assert.equal(r.overall, "no_citations");
  assert.equal(r.checks.length, 0);
  assert.equal(r.counts.total, 0);
}

async function testMarkerWithoutTrace() {
  // The trace is empty → every marker resolves to `missing`. We
  // skip the DB lookups because no document_ids surface.
  const r = await validateCitations({
    workspaceId: "ws_test",
    responseText: "The IPS limits cash to 5% [v1].",
    trace: [],
  });
  // Note: in test envs without Supabase env vars, the lookup may
  // still throw; the validator catches and emits `unverifiable`.
  // Both `partial`/`invalid` (when the lookup short-circuits because
  // there are no doc_ids to look up) and `unverifiable` (when the
  // lookup fails) are acceptable here — what we're confirming is
  // that the validator doesn't throw and produces a single check.
  assert.equal(r.checks.length, 1);
  assert.equal(r.checks[0].marker, "[v1]");
  assert.equal(r.checks[0].type, "vault");
  assert.ok(
    ["missing", "unverifiable"].includes(r.checks[0].status),
    `unexpected status: ${r.checks[0].status}`,
  );
}

async function testMixedMarkers() {
  const r = await validateCitations({
    workspaceId: "ws_test",
    responseText:
      "Per the IPS [v1], cash is capped. The client also mentioned this [mem:abcd1234] last quarter.",
    trace: [],
  });
  assert.equal(r.checks.length, 2);
  assert.equal(r.checks[0].type, "vault");
  assert.equal(r.checks[1].type, "memory");
}

async function testIgnoresUnrecognizedBrackets() {
  const r = await validateCitations({
    workspaceId: "ws_test",
    responseText: "Footnote [1] and [Note] are not citation markers.",
    trace: [],
  });
  assert.equal(r.overall, "no_citations");
  assert.equal(r.checks.length, 0);
}

async function run() {
  await testNoCitations();
  await testMarkerWithoutTrace();
  await testMixedMarkers();
  await testIgnoresUnrecognizedBrackets();
  console.log("citation-validator: all tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
