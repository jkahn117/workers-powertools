/**
 * @workers-powertools/tracer
 *
 * @deprecated This package is deprecated. Cloudflare Workers does not expose
 * an API for injecting custom spans into the built-in tracing system — the
 * spans emitted by this package are structured log entries, not real trace
 * spans in the Workers trace waterfall.
 *
 * **Migration guide:**
 * - For request instrumentation, use `Logger.createEvent()` (wide events)
 *   instead of `captureAsync()` / `captureMethod()`.
 * - For correlation ID propagation on outbound fetch, use `captureFetch()`
 *   from `@workers-powertools/commons`.
 * - For correlation ID extraction, use `extractCorrelationId()` from
 *   `@workers-powertools/commons`.
 *
 * This package will continue to work but will not receive new features.
 */

export { Tracer } from "./tracer";
export type { TracerConfig, SpanContext, CaptureMethodOptions } from "./types";
