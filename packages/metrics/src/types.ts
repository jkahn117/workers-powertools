import type { PowertoolsConfig } from "@workers-powertools/commons";
import type { MetricUnit } from "./units";

/**
 * Context passed to every backend write call.
 * Provided by the Metrics class — backends do not need to resolve this.
 */
export interface MetricContext {
  /** Logical namespace grouping related metrics (e.g. "ecommerce"). */
  namespace: string;

  /** Service name emitting the metrics. */
  serviceName: string;

  /**
   * Correlation ID from the current request or RPC invocation.
   * Injected automatically when a Logger instance is provided to Metrics.
   * Included as a named field in every flushed record so metrics and logs
   * can be correlated in the same query.
   */
  correlationId?: string;
}

/**
 * Backend interface for writing metric entries.
 *
 * Implement this interface to add custom metric destinations
 * (Prometheus push gateway, Datadog, OpenTelemetry, etc.).
 *
 * Two built-in implementations are provided:
 * - PipelinesBackend (default) — named-field JSON records via Cloudflare Pipelines
 * - AnalyticsEngineBackend (explicit opt-in) — positional blobs via Analytics Engine
 */
export interface MetricsBackend {
  /**
   * Write metric entries asynchronously. Awaitable — use with
   * ctx.waitUntil(metrics.flush()) so writes don't block the response.
   */
  write(entries: MetricEntry[], context: MetricContext): Promise<void>;

  /**
   * Write metric entries synchronously (fire-and-forget).
   * Use in Durable Object RPC methods and alarm handlers where
   * ExecutionContext is not always available.
   */
  writeSync(entries: MetricEntry[], context: MetricContext): void;
}

/**
 * Configuration for the Metrics utility.
 */
export interface MetricsConfig extends PowertoolsConfig {
  /**
   * Logical namespace grouping all metrics for this service.
   * Falls back to the POWERTOOLS_METRICS_NAMESPACE environment variable,
   * then to "default_namespace" — matching Lambda Powertools behaviour.
   *
   * Use your application name or main service as the namespace so all
   * metrics are easily grouped together.
   *
   * @example "ecommerce", "slide-builder", "payments"
   */
  namespace?: string;

  /**
   * Default dimensions applied to every metric.
   * Useful for environment, region, version, deployment ID, etc.
   */
  defaultDimensions?: Record<string, string>;

  /**
   * When true, each metric is written via the backend immediately
   * on addMetric() rather than buffered for an explicit flush() call.
   *
   * Use this in Durable Object alarm handlers and queue consumers
   * where ExecutionContext is not available. In Worker fetch handlers,
   * prefer buffered mode with ctx.waitUntil(metrics.flush()).
   *
   * @default false
   */
  autoFlush?: boolean;

  /**
   * Backend to use for writing metrics. Defaults to no backend — you
   * must call setBackend() before flushing, or provide a backend here.
   *
   * Use PipelinesBackend (recommended) or AnalyticsEngineBackend (opt-in).
   */
  backend?: MetricsBackend;
}

/**
 * A single buffered metric data point.
 */
export interface MetricEntry {
  name: string;
  unit: MetricUnit;
  value: number;
  /** Merged default + per-call dimensions. */
  dimensions: Record<string, string>;
  timestamp: number;
}
