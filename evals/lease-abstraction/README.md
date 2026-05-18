# Lease Abstraction Accuracy Benchmark

Field-by-field accuracy measurement for the `abstract_lease` Vergil
skill. Measures whether the skill correctly extracts every standard CRE
lease term and whether each extracted value carries a vault citation.

## Why this exists

Lease abstraction is the highest-stakes Vergil skill -- a wrong rent
number or missed renewal option directly costs the broker money. This
harness lets us measure extraction accuracy across lease types and
field categories, track it over time, and catch regressions before
they ship.

## Layout

```
evals/lease-abstraction/
  types.ts           type definitions
  scorer.ts          field-by-field scoring (no API calls)
  runner.ts          CLI harness (cached or live mode)
  fixtures/          eval cases (JSON, one per lease)
  responses/         cached markdown outputs from the skill
  results/           timestamped JSON result files
```

## Eval case structure

Each fixture JSON defines:

- `id` -- stable slug, e.g. `nnn-retail-10yr-001`
- `description` -- one sentence
- `lease_type` -- `nnn`, `gross`, `modified_gross`, `ground`, `sublease`
- `document_name` -- vault document title the skill would search for
- `expected_fields` -- ground-truth extractions with match modes

### Match modes

| Mode                 | Behavior                                                   |
|----------------------|------------------------------------------------------------|
| `exact`              | Case-insensitive trim comparison                           |
| `contains`           | Expected is a substring of actual                          |
| `regex`              | Expected is a regex pattern, tested against actual         |
| `numeric_within_pct` | Parse both as numbers, compare within `tolerance_pct`      |
| `date_match`         | Parse both as dates, match regardless of format            |

## Running

```bash
# Score cached responses (no API key needed)
npx tsx evals/lease-abstraction/runner.ts

# Score one case
npx tsx evals/lease-abstraction/runner.ts --case=sample-nnn-lease

# Live mode: call the API, save response, then score
npx tsx evals/lease-abstraction/runner.ts --live

# Live, one case
npx tsx evals/lease-abstraction/runner.ts --live --case=sample-nnn-lease
```

### Cached mode (default)

The runner loads pre-saved markdown from `responses/<case-id>.md` and
scores it against the fixture. This is the fast path for iterating on
the scorer or adding new expected fields.

To seed a cached response: either run once with `--live`, or manually
place the abstract markdown in `responses/<case-id>.md`.

### Live mode

Requires `ANTHROPIC_API_KEY`. Sends a simplified version of the
`abstract_lease` prompt to the API, saves the response, and scores it.
Results are written to `results/<timestamp>.json`.

## Metrics

The scorer reports per-field and aggregate:

- **Precision** -- of extracted fields, fraction that matched
- **Recall** -- of expected fields, fraction that were matched
- **F1** -- harmonic mean of precision and recall
- **Citation rate** -- fraction of extracted fields with a `[vN]` marker

Per-category breakdowns (rent, term, parties, etc.) surface which
field types the skill struggles with.

## Adding a case

1. Create a JSON file in `fixtures/` following the schema in `types.ts`.
   See `sample-nnn-lease.json` as a template.
2. Either run `--live` to generate a response or manually place
   markdown in `responses/<your-case-id>.md`.
3. Run the scorer and verify the results make sense.

## Current state

- Scorer and runner scaffolded
- 1 sample NNN lease case
- Dataset target: 10+ cases across lease types before calling this
  production-ready
