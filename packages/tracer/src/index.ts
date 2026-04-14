/**
 * @workers-powertools/tracer
 *
 * Request correlation and trace enrichment for Cloudflare Workers.
 * Complements the built-in automatic tracing with correlation ID
 * propagation, custom spans, and outbound fetch instrumentation.
 */

export { Tracer } from "./tracer";
export type { TracerConfig, SpanContext, CaptureMethodOptions } from "./types";
