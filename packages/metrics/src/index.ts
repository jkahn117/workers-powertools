/**
 * @workers-powertools/metrics
 *
 * Named business metrics for Cloudflare Workers — modelled after
 * Lambda Powertools Metrics. Emits successfulBooking, deckGenerated,
 * failedPayment-style events with a namespace, dimensions, and units.
 *
 * Default backend: Cloudflare Pipelines → R2/Iceberg (named columns).
 * Opt-in backend: Analytics Engine (positional blobs — see limitations).
 */

export { Metrics } from "./metrics";
export { MetricUnit } from "./units";
export { PipelinesBackend } from "./pipelinesBackend";
export { AnalyticsEngineBackend } from "./analyticsEngineBackend";
export type { MetricsConfig, MetricEntry, MetricsBackend, MetricContext } from "./types";
export type { PipelinesBackendOptions, PipelineBinding } from "./pipelinesBackend";
export type { AnalyticsEngineBackendOptions } from "./analyticsEngineBackend";
