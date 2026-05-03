# Drift Smoke Tests

Phase 4 W4.1. Five canonical paths run on every PR. A failure
blocks merge. The suite exists because four production bugs in a
single 30-minute test session showed that exploration-time
assumptions about runtime behavior were unreliable. The smoke
suite is the runtime check.

## Paths covered

1. **auth** — `/api/auth/whoami` returns the logged-in user
2. **chat** — `/api/assistant/ask` streams a response with at least one SSE frame
3. **citation** — chat response contains a chip; the chip resolves to a real source
4. **vault-viewer** — `/vault/[id]?page=N` returns 200 with renderable content
5. **memory-search** — `dante_memory_search` RPC returns rows without erroring

## Running locally

```sh
SMOKE_BASE_URL=http://localhost:3000 \
SMOKE_AUTH_COOKIE=<paste from devtools> \
npx tsx tests/smoke/run.ts
```

## Running in CI

`npm run smoke` — uses `SMOKE_BASE_URL=https://driftai.studio` and
`SMOKE_AUTH_COOKIE` from a CI secret tied to a dedicated test user.

A failed path prints the path name + the assertion that broke +
the response body (truncated to 500 chars). Exit code 1.

## Expanding the suite

Adding a sixth path = one file under `tests/smoke/` that exports
`{ name, run }`. The runner discovers them automatically.
