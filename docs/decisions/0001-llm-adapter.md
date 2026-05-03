# ADR 0001 — LLM Adapter

**Date:** 2026-05-02
**Phase:** 0, W0.1
**Status:** Accepted (in progress)

## Context

Drift was calling OpenAI directly from many call sites — some via the
`openai` SDK (`new OpenAI(...)`), others via raw
`fetch("https://api.openai.com/v1/...")`. A full audit found 10
SDK-imported sites and ~30 raw-fetch sites. Every chat completion,
embedding, or transcription was its own bespoke piece of glue.

That is fine until the day we want to:
- Add a Claude or Gemini fallback for reliability or per-vertical tuning.
- Route certain features to a smaller / cheaper model.
- Add per-feature cost telemetry without wiring it into every call site.
- Enforce rate limits or per-workspace quotas at the LLM layer.

None of those land cleanly with the current shape.

## Decision

A single adapter at `lib/llm/client.ts` exposes:

- `complete(opts)` — non-streaming chat completion (tools, JSON mode, etc.)
- `embed(opts)` — text embeddings
- `transcribe(opts)` — Whisper

All call sites import from there. No file outside `lib/llm/` is allowed
to import the `openai` SDK or `fetch("https://api.openai.com/...")`
directly. A grep for either pattern is part of the parity scorecard's
weekly review.

The adapter today is OpenAI-only. The interface is provider-neutral so
a future Anthropic / Gemini / local-model backend lands as a routing
change inside `lib/llm/`, not a sweep across the codebase.

## Consequences

**Positive:**
- One seam for provider swaps, fallbacks, telemetry, rate limiting.
- Per-feature cost attribution becomes a single `feature` tag passed
  through the adapter — no per-call-site instrumentation.
- TypeScript types in `lib/llm/types.ts` document the actual contract;
  call sites can no longer drift from each other.

**Negative / costs:**
- Migrating all ~40 call sites is mechanical but volume work. Phase 0
  migrated the 10 SDK-imported sites and the 2 highest-traffic
  fetch-based sites (`lib/dante/agent.ts`, `lib/dante/archive/embed.ts`).
- ~28 raw-fetch sites remain. They are tracked under [PARITY-001] in
  `docs/parity-scorecard.md` and are expected to migrate
  opportunistically (when a file is touched for other reasons) and via
  one explicit cleanup PR before Phase 2 closes.

**Open question:** Streaming. The agent loop today is non-streaming
per iteration (the SSE stream to the browser is at the agent-event
layer, not the token layer). If we add token-level streaming later,
the adapter gains a `completeStream(opts)` returning an async iterator.

## Migration status (snapshot)

| Site | Status |
|---|---|
| `lib/dante/agent.ts` | ✅ Migrated |
| `lib/dante/archive/embed.ts` | ✅ Migrated |
| `app/api/dashboard/copilot/route.ts` | ✅ Migrated |
| `app/api/properties/intake/route.ts` | ✅ Migrated |
| `app/api/reminders/draft/route.ts` | ✅ Migrated |
| `app/api/vault/[id]/fill/route.ts` | ✅ Migrated |
| `app/api/twilio/media-stream-process/route.ts` | ✅ Migrated (Whisper) |
| `lib/emails/triage.ts` | ✅ Migrated |
| `lib/emails/categorize.ts` | ✅ Migrated |
| `lib/review/run.ts` | ✅ Migrated |
| ~28 raw-fetch sites | ⏳ Tracked, deferred (PARITY-001) |
