# Drift Eval Suite

Phase 1 W1.4. Versioned, vertical-aware regression tests for the
agent + prompt + tool stack.

## Why

The whole product rests on "the AI is reliable and grounded." A
prompt tweak two weeks from now that subtly degrades RIA citation
accuracy needs to fail CI before it ships. An eval suite is the
only thing that catches that.

## Vertical parity gate (ADR 0002)

Every change to prompts, the LLM adapter, or the agent loop must
not regress eval pass rates in either vertical. CI rejects PRs that
break advisor or realtor tasks.

Target task counts:
- Phase 1: ≥10 advisor + ≥10 realtor (this scaffold ships 10/10).
- Phase 3: ≥100 advisor + ≥100 realtor (parity sprint W3.5).

## Layout

```
evals/
├── README.md                  this file
├── runner.ts                  orchestrator — runs tasks against a target
├── types.ts                   EvalTask shape
├── tasks/
│   ├── advisor/               RIA-flavored tasks
│   │   ├── 001-summarize-client-call.json
│   │   ├── 002-...
│   └── realtor/               realtor-flavored tasks
│       ├── 001-tour-followup.json
│       ├── 002-...
└── fixtures/                  shared seed data referenced by tasks
```

## Running

```sh
# All tasks, both verticals
npx tsx evals/runner.ts

# One vertical
npx tsx evals/runner.ts --vertical=advisor
npx tsx evals/runner.ts --vertical=realtor

# Specific task by id
npx tsx evals/runner.ts --task=001-summarize-client-call
```

Output is per-task pass/fail with reasons, ending in a vertical-split
summary:

```
ADVISOR: 9/10 passed (90%)
REALTOR: 8/10 passed (80%)  [parity flag — Δ ≥ 2]
```

## Eval task shape

A task is a JSON file with:
- `id` — unique slug (`001-summarize-client-call`)
- `vertical` — `"advisor"` or `"realtor"`
- `description` — one-line plain English
- `input` — what to ask the agent
- `expectations` — array of asserts that must hold on the output

See `types.ts` for the full schema. Asserts are deliberately small
and composable: `must_cite`, `must_contain`, `must_not_contain`,
`min_citation_count`, etc.

## CI integration

`.github/workflows/evals.yml` runs the suite on every change to
`prompts/`, `lib/llm/`, `lib/dante/agent.ts`, `lib/dante/system-prompt.ts`.
Failures block merge.

## Phase 1 status

Initial scaffold ships 10 advisor + 10 realtor tasks designed to
exercise:
- Citation-grounded answers (`must_cite`)
- Refusal on missing data (`must_not_contain` for invented facts)
- Tool selection (memory.search vs archive.search vs vault.cite)
- Vertical-specific terminology

The runner is intentionally lightweight (no vitest dep) — it shells
through the LLM adapter and the agent loop directly. Future phases
upgrade to a full harness with parallelism + per-model comparison.
