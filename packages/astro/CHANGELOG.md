# @workers-powertools/astro

## 0.3.0

### Minor Changes

- Wide event middleware support via `wideEvent` option on `injectLogger`
- Tracer is now optional in observability middleware

### Patch Changes

- Updated dependencies
  - @workers-powertools/logger@0.2.0
  - @workers-powertools/metrics@0.4.0
  - @workers-powertools/tracer@0.2.0

## 0.2.0

### Minor Changes

- e754c6b: Add a new Astro adapter package with middleware for `logger`, `tracer`, and `metrics` on Cloudflare Workers.

  This release includes:
  - `injectLogger`
  - `injectTracer`
  - `injectMetrics`
  - `injectObservability`
  - `getMetricsBackendFromEnv`
  - subpath exports for each adapter surface

  The package is middleware-only in v1 and is designed for Astro apps using the Cloudflare adapter.

## 0.1.0

### Minor Changes

- Initial release. Astro middleware adapters for `logger`, `tracer`, and `metrics` on Cloudflare Workers.
