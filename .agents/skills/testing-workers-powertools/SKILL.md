---
name: testing-workers-powertools
description: Test Workers Powertools library features end-to-end. Use when verifying Logger, wide events, PII redaction, structured errors, sampling, buffer cap, or sample app behavior.
---

# Testing Workers Powertools

## Prerequisites

- pnpm installed
- Node.js 18+

## Devin Secrets Needed

None for local testing. Cloudflare account credentials needed only for deployed testing (idempotency with real KV/D1, metrics with Pipelines).

## Quick Start

```bash
cd /path/to/workers-powertools
pnpm install
pnpm build
```

## Running Tests

### Unit Tests
```bash
pnpm test          # All 18 test suites via turbo
pnpm lint          # ESLint
pnpm typecheck     # TypeScript strict
pnpm size          # Bundle size budgets
```

### Sample Apps (Wide Events End-to-End)

The sample apps demonstrate wide events in real Workers. Run via `wrangler dev`:

```bash
# vanilla-worker (port 8787)
cd examples/vanilla-worker && npx wrangler dev --port 8787

# hono-worker (port 8788)
cd examples/hono-worker && npx wrangler dev --port 8788
```

Then curl and check the wrangler console output:
```bash
curl http://localhost:8787/items
curl http://localhost:8788/items
```

**What to verify in log output:**
- Single JSON entry per request (not scattered logs)
- `duration_ms` field present (numeric)
- `correlation_id` field present (UUID)
- `service` field matches wrangler.jsonc `POWERTOOLS_SERVICE_NAME`
- Accumulated fields from `event.set()` calls present (e.g., `method`, `path`, `itemCount`)
- CF properties present (`colo`, `country`, `asn`, etc.)

**resetContext verification:** Send two sequential requests and confirm:
- Different `correlation_id` values (fresh UUID per request)
- No field leak between requests (fields from request 1 absent in request 2)

### Testing Logger Features Directly

For features not exercised by sample apps (PII redaction, structured errors, sampling, buffer cap), write a Node.js script that imports from the built dist:

```javascript
import { Logger } from "/path/to/packages/logger/dist/index.js";
import { BUILTIN_REDACT_PATTERNS } from "/path/to/packages/logger/dist/redactPatterns.js";
```

Key features to test:

1. **PII Redaction** — Create Logger with `redact: { enabled: true, patterns: Object.values(BUILTIN_REDACT_PATTERNS) }`. Log strings containing credit cards, emails, IPs, JWTs. Verify output contains `[REDACTED_*]` placeholders. Test nested objects AND string arrays (bug fix dd437c2).

2. **Structured Errors** — Call `logger.error("msg", { error: new Error("x"), why: "...", fix: "...", link: "..." })`. Verify output contains `error_name`, `error_message`, `stack_trace`, `why`, `fix`, `link`.

3. **Two-tier Sampling** — Create Logger with `sampleRate: 0`. Call `addContext()` first (sampling decision happens there). Verify `info()` produces no output but `error()` still emits.

4. **Buffer Cap** — Create Logger with `logBufferingEnabled: true, maxBufferSize: N, logLevel: "WARN"`. Log more than N DEBUG entries (below threshold → buffered). Trigger `error()` to flush. Verify only last N buffered entries survive. Note: error emits first, THEN buffer flushes.

5. **Wide Event duration_ms** — Create event, wait >10ms, emit. Verify `duration_ms >= 10`.

6. **Double-emit guard** — Call `emit()` twice on same WideEvent. Verify only 1 JSON log entry produced.

## Known Limitations

- **KV/D1 bindings** are commented out in sample app wrangler.jsonc files. POST /items will fail with 500 (idempotency layer not initialized). This is expected for local testing without Cloudflare account.
- **Pipelines binding** not configured. Metrics warning logged but app works fine.
- **tanstack-start-worker** might need additional setup for SSR framework.

## Tips

- Capture wrangler dev console output separately from curl responses — the log entries appear in the wrangler terminal, not in HTTP responses.
- When testing sampling, always call `addContext()` before logging — sampling decision is made in `addContext()`.
- Bundle size budget for logger is 6KB gzipped. Run `pnpm size` after any changes.
- The test script approach (importing dist files directly) is much faster than setting up a full wrangler dev Worker for feature testing.
