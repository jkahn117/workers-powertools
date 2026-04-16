---
"@workers-powertools/astro": minor
---

Add a new Astro adapter package with middleware for `logger`, `tracer`, and `metrics` on Cloudflare Workers.

This release includes:

- `injectLogger`
- `injectTracer`
- `injectMetrics`
- `injectObservability`
- `getMetricsBackendFromEnv`
- subpath exports for each adapter surface

The package is middleware-only in v1 and is designed for Astro apps using the Cloudflare adapter.
