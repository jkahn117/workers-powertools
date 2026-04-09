import type { PowertoolsConfig } from "@workers-powertools/commons";
import type { MetricUnit } from "./units";

/**
 * Configuration for the Metrics utility.
 */
export interface MetricsConfig extends PowertoolsConfig {
  /**
   * Namespace for the metrics, maps to an Analytics Engine dataset.
   * Used to group related metrics together.
   */
  namespace: string;

  /**
   * Default dimensions applied to every metric.
   * Useful for environment, version, region, etc.
   */
  defaultDimensions?: Record<string, string>;

  /**
   * When true, each metric is written to Analytics Engine immediately
   * on addMetric() rather than buffered for an explicit flush() call.
   *
   * Use this in Durable Object RPC methods and scheduled alarm handlers
   * where ExecutionContext is not available and ctx.waitUntil() cannot
   * be called. In Worker fetch handlers, prefer the default buffered
   * mode with ctx.waitUntil(metrics.flush()) instead.
   *
   * @default false
   */
  autoFlush?: boolean;
}

/**
 * A single metric data point before it is flushed.
 */
export interface MetricEntry {
  name: string;
  unit: MetricUnit;
  value: number;
  dimensions: Record<string, string>;
  timestamp: number;
}
