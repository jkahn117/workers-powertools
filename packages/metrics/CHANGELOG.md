# @workers-powertools/metrics

## 0.3.0

### Minor Changes

- 85e8591: Nest dimensions under a `dimensions` JSON field instead of spreading them as top-level columns. This keeps the Pipelines stream schema stable when new dimensions are added — no stream recreation needed.

  **Breaking change:** If you previously relied on dimensions as top-level fields in your stream schema, you'll need to either update your schema to use a `dimensions` JSON column, or subclass `PipelinesBackend` to restore the old behavior (see "Custom dimension mapping" in the README).

  Also adds:
  - `schema.json` — reference stream schema shipped with the package
  - `PIPELINES_SETUP.md` — standalone deployment guide for consumers
  - Expanded README with 7-step pipeline setup, R2 SQL query examples, and custom dimension mapping

## 0.2.1

### Patch Changes

- Updated dependencies
  - @workers-powertools/commons@0.1.1

## 0.2.0

### Minor Changes

- e016fb0: Fix dimension leakage, correlationId population, and idempotent backend setup in metrics.

  **Breaking change:** `addDimension()` has been removed. Pass dimensions as the optional fourth
  argument to `addMetric()` instead:

  ```ts
  // Before
  metrics.addDimension("route", "/orders");
  metrics.addMetric("orderLatency", MetricUnit.Milliseconds, 42);

  // After
  metrics.addMetric("orderLatency", MetricUnit.Milliseconds, 42, { route: "/orders" });
  ```

  This eliminates a concurrency hazard where concurrent requests in the same Workers isolate
  could clobber each other's dimensions via the shared `requestDimensions` object.

  **New:** `setCorrelationId(id)` propagates a correlation ID into every flushed record via
  `MetricContext.correlationId`. The ID is cleared automatically after each flush.

  ```ts
  metrics.setCorrelationId(correlationId);
  metrics.addMetric("slidesGenerated", MetricUnit.Count, 1);
  await metrics.flush(); // context includes correlationId
  ```

  **Fix:** `buildContext()` was previously called after `clearEntries()`, causing
  `correlationId` to always be `undefined` in flushed records even when set.

  **Fix:** `setBackend()` is now idempotent — if the new backend wraps the same binding
  reference as the current one, the call is skipped. This avoids unnecessary object
  allocation on every request in the `injectMetrics` Hono middleware.

## 0.1.0

### Minor Changes

- Initial release - 0.1.0. Note that this package is highly experimental and subject to change.

### Patch Changes

- Updated dependencies
  - @workers-powertools/commons@0.1.0
