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
