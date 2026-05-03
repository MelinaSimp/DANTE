# ADR 0002 — Dual-Vertical Commitment

**Date:** 2026-05-02
**Phase:** 0, principles
**Status:** Accepted

## Context

Drift serves two verticals from one codebase:
- **Financial advisors** (assistant: Dante) — RIAs, wealth management.
- **Real estate agents** (assistant: Vergil) — brokerages, individual realtors.

The product thesis (citation-grounded AI for regulated professionals)
applies to both. The buyers, regulatory regimes, integrations, vocabulary,
and workflows do not. The temptation — observed during the panel review
that produced this plan — is to pick one vertical and de-emphasize the
other.

## Decision

**Drift continues to serve both verticals.** The architecture is
shared core, vertical edges:

```
┌────────────────────────────────────────────────────┐
│  Vertical-specific layer                           │
│  - wm_*, re_* heavy entities                       │
│  - integration adapters (custodians vs MLS)        │
│  - vertical dashboards, vertical workflows         │
├────────────────────────────────────────────────────┤
│  Industry config layer (lib/industry/)             │
│  - personas, copy, starter questions               │
│  - tool whitelists, prompt fragments               │
│  - memory taxonomies, retention defaults           │
├────────────────────────────────────────────────────┤
│  Shared core (vertical-agnostic)                   │
│  - auth, RLS, workspaces, billing                  │
│  - LLM adapter, agent loop, workflow engine        │
│  - vault, memory, audit log, MCP                   │
└────────────────────────────────────────────────────┘
```

## Operating principles (parity discipline)

These five gates are checked at the end of every sprint and every phase:

1. **Schema check** — Every new RIA-shaped entity has a realtor
   counterpart or is provably industry-agnostic.
2. **Prompt check** — Any change to Dante's prompt has a corresponding
   Vergil change reviewed in the same PR.
3. **Eval check** — Both vertical eval sets at parity size; no
   regression in either.
4. **Empty state check** — No new surface ships without empty states
   for both verticals.
5. **Telemetry check** — Metrics segmentable per vertical. A feature
   without per-vertical telemetry is incomplete.

A phase doesn't close until all five gates pass. Tracked weekly in
`docs/parity-scorecard.md`.

## Consequences

**Positive:**
- Single codebase keeps engineering velocity compounding.
- The citation thesis serves both regulators (SEC + state real estate
  boards) — moat doubles.
- Shared LLM adapter, billing engine, agent loop amortize across both
  audiences.

**Negative / costs:**
- Discipline tax. Every feature needs both-vertical thinking, which
  is slower than picking one.
- Risk of dilution: deeper vertical features (custodian feeds, MLS
  integration) require dedicated investment per vertical.
- GTM is harder — buyer personas, sales cycles, marketing all fork.

## Out of scope (explicitly)

- Two separate codebases.
- Two separate brands. Externally: "Drift" with editions
  ("Drift for Advisors", "Drift for Realtors"). Internally: one product.
- Hard-coded `if (industry === "real_estate")` branching outside
  `lib/industry/` and clearly-marked vertical-specific modules.
