# Call-Summary Evals

Golden cases for the citation-grounded call-summary pipeline in
`app/api/calls/process/route.ts`. The pipeline's job: given a call
transcript, produce a structured summary where **every claim cites the
exact transcript segment it came from, and the verification pass drops
any claim the citations don't support**.

The harness in this folder grades whether the pipeline actually does
that.

## Why this exists

For an RIA compliance officer to trust an AI summary, they need to see:
1. **Which claims the system made.**
2. **Whether each claim cites a real part of the call.**
3. **Whether the cited part actually supports the claim.**
4. **Whether the system kept quiet when it didn't have a source.**

The live product already does #1–#3 via `CallAuditView`. This harness
measures *how often it gets them right* on cases we've graded by hand.

That measurement is the thing that changes "we built a feature" into
"we can tell you our error rate on these ten real cases."

## Case structure

Each case is a JSON file under `cases/` matching `case-schema.json`.
A case bundles:

- **`transcript_segments`** — Whisper-style segments `[{id, start, end, text}]`
- **`must_mention`** — facts the summary must surface (missing one = fail)
- **`prohibited`** — claims the summary must NOT make (hallucination)
- **`expected_citations`** — for each `must_mention`, which segment IDs are
  valid supporting citations (any of them satisfies the cite)
- **`rubric`** — extra qualitative checks (e.g. "action items owner is
  advisor, not client")

## Failure conditions (borrowed from Drift-AI repo)

A case **fails** if any of:

1. **Material claim without support** — a claim the model emits whose
   `cite_segments` is empty or missing
2. **Citation that does not support the claim** — `cite_segments`
   references exist in the transcript, but the cited text is unrelated
3. **Missing required section** — one of `must_mention` doesn't appear
   anywhere in the structured output
4. **Misstated compliance issue** — rubric-level check, e.g. summary
   says "we discussed rebalancing" when the call discussed an RMD

## Target

**10 cases to start** (April–May 2026). **100 cases before calling the
pipeline production-ready.** Numbers borrowed from Luca's repo; 100 is
roughly the threshold where per-case noise averages out.

## How to run

```bash
# Run all cases in ./cases against the live pipeline
npm run eval:call-summary

# Run a single case
npm run eval:call-summary -- cases/sample-rmd-conversation.json
```

Exits non-zero if any case fails. Prints per-case pass/fail and a
summary of which failure conditions fired.

## Current state

- Harness scaffolded
- Scoring logic implemented for the four failure conditions above
- **Dataset: 1 sample case** — intentionally honest about where we are
