import { PowertoolsBase } from "@workers-powertools/commons";
import type { MetricsConfig, MetricEntry } from "./types";
import type { MetricUnit } from "./units";

/**
 * Analytics Engine limits:
 * - 20 blobs (strings, max 256 bytes each)
 * - 20 doubles (numbers) per data point
 */
const MAX_BLOBS = 20;
const MAX_DOUBLES = 20;

/**
 * Custom metrics utility for Cloudflare Workers.
 *
 * Wraps Analytics Engine's writeDataPoint API with an ergonomic
 * interface for named metrics, dimensions, and batched flushing.
 */
export class Metrics extends PowertoolsBase {
  private readonly namespace: string;
  private readonly defaultDimensions: Record<string, string>;
  private readonly entries: MetricEntry[] = [];
  private requestDimensions: Record<string, string> = {};
  private analyticsBinding?: AnalyticsEngineDataset;

  constructor(config: MetricsConfig) {
    super(config);
    this.namespace = config.namespace;
    this.defaultDimensions = { ...config.defaultDimensions };
  }

  /**
   * Set the Analytics Engine binding. Must be called with the
   * env binding before flushing metrics.
   */
  setBinding(binding: AnalyticsEngineDataset): void {
    this.analyticsBinding = binding;
  }

  /** Add a dimension for the current request scope. */
  addDimension(key: string, value: string): void {
    this.requestDimensions[key] = value;
  }

  /** Record a metric data point. */
  addMetric(name: string, unit: MetricUnit, value: number): void {
    this.entries.push({
      name,
      unit,
      value,
      dimensions: {
        ...this.defaultDimensions,
        ...this.requestDimensions,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Flush all collected metrics to Analytics Engine.
   *
   * Should be called via ctx.waitUntil(metrics.flush()) so it
   * doesn't block the response.
   */
  async flush(): Promise<void> {
    if (!this.analyticsBinding) {
      console.warn(
        "[Metrics] No Analytics Engine binding set. Call setBinding(env.ANALYTICS) before flushing.",
      );
      return;
    }

    for (const entry of this.entries) {
      const allDimensions: Record<string, string> = {
        namespace: this.namespace,
        service: this.serviceName,
        metric_name: entry.name,
        metric_unit: entry.unit,
        ...entry.dimensions,
      };

      // Pack dimensions into blobs (first N keys, capped at MAX_BLOBS)
      const blobKeys = Object.keys(allDimensions).slice(0, MAX_BLOBS);
      const blobs = blobKeys.map((k) => allDimensions[k] ?? "");

      // Pack metric value into doubles (position 0)
      const doubles = [entry.value];

      if (doubles.length > MAX_DOUBLES) {
        console.warn(
          `[Metrics] Metric "${entry.name}" exceeds ${String(MAX_DOUBLES)} doubles limit. Truncating.`,
        );
        doubles.length = MAX_DOUBLES;
      }

      this.analyticsBinding.writeDataPoint({
        blobs,
        doubles,
        indexes: [entry.name],
      });
    }

    // Clear entries after flush
    this.entries.length = 0;
    this.requestDimensions = {};
  }
}
