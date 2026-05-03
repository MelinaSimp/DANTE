# Drift Versioned Prompts

Phase 3 W3.5. Prompts as first-class versioned artifacts so prompt
changes survive code review and the eval suite (`evals/`) can pin
to a specific version when reproducing a regression.

## Layout

- `dante-v3.md` — financial advisor persona, version 3.
- `vergil-v3.md` — real estate agent persona, version 3.

Both verticals are kept at the same depth (length, specificity,
exemplars) per ADR 0002 parity discipline. A change to one is
reviewed alongside the corresponding change to the other.

## How they're loaded

Today, the runtime prompt is built by
`lib/dante/system-prompt.ts:buildDanteSystemPrompt()`. That builder
inlines the prompt body — these markdown files are the *canonical
source of truth* the builder reads from.

When the builder is migrated to load from disk (Phase 3 follow-up),
the file frontmatter (`Version`) is logged on every agent run for
traceability.

## Versioning rules

- **Bump the version** any time the citation rule, tool list, or
  persona identity changes. Cosmetic copy tweaks can ride on the
  same version.
- **Do not delete old versions.** They are referenced by
  audit-logged agent runs that need to be reproducible months later.
- **Both verticals bump together.** Dante v4 ships alongside Vergil
  v4. CI rejects PRs that update one without the other.

## Eval coverage

The eval suite (`evals/runner.ts`) currently runs against whatever
prompt the live builder produces. Pinning to a specific prompt
version is on the W3.5 follow-up list — the indirection lands when
we add A/B prompt comparison.
