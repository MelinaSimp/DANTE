# ADR 0003 — Route Naming Unification (Deferred to Phase 2)

**Date:** 2026-05-02
**Phase:** 0, W0.4
**Status:** Deferred

## Context

The chat assistant lives at `/api/dante/*` (36 routes) with ~50
client-side fetch sites referencing those paths. Vergil (the realtor
persona) reuses the same routes — only the system prompt and
starter copy flip per industry. There is no `/api/vergil/*` directory.

The plan called for renaming `/api/dante/*` → `/api/assistant/*` so
the route tree reads as one product with two personas (rather than
"Dante" being the canonical name and "Vergil" feeling like a sticker).

## Decision

**Defer the route rename to Phase 2.** Phase 0 ships the LLM adapter,
the dashboard cleanup, the parity scorecard, and the decision log.
Doing 36 route moves + ~50 client-side fetch updates in the same
sprint as the adapter migration is too much surface change for one
deploy window — every regression risk stacks against the others.

## Migration plan (Phase 2)

1. Move route files from `app/api/dante/*` to `app/api/assistant/*`.
2. Add `redirects()` entries in `next.config.ts` for every old path
   (`/api/dante/ask` → `/api/assistant/ask`, etc.) so external
   integrations don't break mid-deploy.
3. Update client-side fetch URLs in `app/dante/**` and any other
   consumers in one sweep.
4. Persona resolution stays driven by `workspace.industry` —
   no URL ever encodes the persona.

Tracked under [PARITY-002] in the parity scorecard.

## Why this is safe to defer

- Externally, the URLs are not customer-facing (they are XHR endpoints).
- Internally, the dual-naming costs nothing technical — it just
  reads awkwardly.
- The vertical parity work in Phase 1 (citation validator, memory
  review queue, eval suite) is more valuable and depends on neither
  the rename nor the adapter migration being 100% complete.
