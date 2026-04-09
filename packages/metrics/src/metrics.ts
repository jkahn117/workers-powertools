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
 *
 * Two flush modes:
 * - **Buffered (default):** metrics are queued and written together via
 *   flush() or flushSync(). In fetch handlers, call
 *   ctx.waitUntil(metrics.flush()) so writes don't block the response.
 * - **Auto-flush:** set autoFlush: true to write each metric immediately
 *   on addMetric(). Use this in Durable Object RPC methods and alarm
 *   handlers where ExecutionContext is not always available.
 */
export class Metrics extends PowertoolsBase {
  private readonly namespace: string;
  private readonly defaultDimensions: Record<string, string>;
  private readonly entries: MetricEntry[] = [];
  private requestDimensions: Record<string, string> = {};
  private analyticsBinding?: AnalyticsEngineDataset;
  private readonly autoFlush: boolean;

  constructor(config: MetricsConfig) {
    super(config);
    this.namespace = config.namespace;
    this.defaultDimensions = { ...config.defaultDimensions };
    this.autoFlush = config.autoFlush ?? false;
  }

  /**
   * Set the Analytics Engine binding. Must be called before any
   * metrics are written, either before addMetric() in autoFlush
   * mode, or before flush()/flushSync() in buffered mode.
   */
  setBinding(binding: AnalyticsEngineDataset): void {
    this.analyticsBinding = binding;
  }

  /** Add a dimension scoped to the current request or operation. */
  addDimension(key: string, value: string): void {
    this.requestDimensions[key] = value;
  }

  /**
   * Record a metric data point.
   *
   * In buffered mode (default), the metric is queued until
   * flush() or flushSync() is called. In autoFlush mode, the
   * metric is written to Analytics Engine immediately.
   */
  addMetric(name: string, unit: MetricUnit, value: number): void {
    const entry: MetricEntry = {
      name,
      unit,
      value,
      dimensions: {
        ...this.defaultDimensions,
        ...this.requestDimensions,
      },
      timestamp: Date.now(),
    };

    if (this.autoFlush) {
      // Write immediately — no buffering. Safe in contexts without
      // ExecutionContext (DO RPC methods, alarm handlers).
      this.writeEntry(entry);
    } else {
      this.entries.push(entry);
    }
  }

  /**
   * Flush all buffered metrics to Analytics Engine.
   *
   * In Worker fetch handlers, prefer:
   *   ctx.waitUntil(metrics.flush())
   * so the write doesn't block the response.
   *
   * In Durable Object contexts where ExecutionContext is available,
   * you may also use ctx.waitUntil(metrics.flush()). If ExecutionContext
   * is not available, use flushSync() instead.
   *
   * No-op when autoFlush is true (metrics are already written on
   * addMetric()).
   */
  async flush(): Promise<void> {
    this.flushSync();
  }

  /**
   * Synchronously flush all buffered metrics to Analytics Engine.
   *
   * writeDataPoint() is a fire-and-forget call on the Analytics Engine
   * binding — it does not return a Promise and does not block. This method
   * is therefore safe to call without ctx.waitUntil() in contexts where
   * ExecutionContext is not available, such as Durable Object RPC methods
   * and alarm handlers.
   *
   * No-op when autoFlush is true (metrics are already written on
   * addMetric()).
   */
  flushSync(): void {
    if (!this.analyticsBinding) {
      console.warn(
        "[Metrics] No Analytics Engine binding set. Call setBinding(env.ANALYTICS) before flushing.",
      );
      return;
    }

    for (const entry of this.entries) {
      this.writeEntry(entry);
    }

    // Clear state after flush
    this.entries.length = 0;
    this.requestDimensions = {};
  }

  /**
   * Write a single metric entry to Analytics Engine.
   * writeDataPoint() is synchronous and fire-and-forget — it does not
   * return a Promise. The runtime handles delivery asynchronously.
   */
  private writeEntry(entry: MetricEntry): void {
    if (!this.analyticsBinding) {
      return;
    }

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

    // Pack metric value into doubles[0]
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
}
