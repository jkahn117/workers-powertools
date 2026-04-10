import type { MetricsBackend, MetricEntry, MetricContext } from "./types";

/**
 * A single metric record as written to the Pipelines stream.
 * Named fields — no positional encoding.
 */
interface PipelineMetricRecord {
  namespace: string;
  service: string;
  metric_name: string;
  metric_unit: string;
  metric_value: number;
  timestamp: string;
  correlation_id?: string;
  [dimension: string]: unknown;
}

/**
 * Minimal interface for a Cloudflare Pipelines binding.
 * Matches the Pipeline<T> interface from @cloudflare/workers-types
 * without importing it directly, keeping this package dependency-free.
 */
export interface PipelineBinding {
  send(records: Record<string, unknown>[]): Promise<void>;
}

/**
 * Options for the PipelinesBackend.
 */
export interface PipelinesBackendOptions {
  /**
   * The Cloudflare Pipelines binding declared in wrangler.jsonc.
   * Accepts any Pipeline binding — typed or generic.
   *
   * @example env.METRICS_PIPELINE
   */
  binding: PipelineBinding;
}

/**
 * Metrics backend that writes to Cloudflare Pipelines → R2/Iceberg.
 *
 * Each metric is emitted as a named-field JSON record. Unlike the
 * AnalyticsEngineBackend, field order is irrelevant — queries use real
 * column names, not positional aliases (blob3 AS provider).
 *
 * Recommended for all new applications. Use AnalyticsEngineBackend only
 * when you have existing AE dashboards that cannot be migrated.
 *
 * @example
 * ```ts
 * import { Metrics, PipelinesBackend } from "@workers-powertools/metrics";
 *
 * const metrics = new Metrics({ namespace: "ecommerce" });
 * metrics.setBackend(new PipelinesBackend({ binding: env.METRICS_PIPELINE }));
 *
 * metrics.addMetric("successfulBooking", MetricUnit.Count, 1);
 * ctx.waitUntil(metrics.flush());
 * ```
 */
export class PipelinesBackend implements MetricsBackend {
  private readonly binding: PipelineBinding;

  constructor(options: PipelinesBackendOptions) {
    this.binding = options.binding;
  }

  async write(entries: MetricEntry[], context: MetricContext): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const records = this.buildRecords(entries, context);
    await this.binding.send(records);
  }

  writeSync(entries: MetricEntry[], context: MetricContext): void {
    if (entries.length === 0) {
      return;
    }

    // Pipeline.send() returns a Promise. In sync contexts (DO RPC methods,
    // alarm handlers) we fire-and-forget — the runtime will complete
    // in-flight promises before the isolate is torn down.
    const records = this.buildRecords(entries, context);
    void this.binding.send(records);
  }

  private buildRecords(
    entries: MetricEntry[],
    context: MetricContext,
  ): PipelineMetricRecord[] {
    return entries.map((entry) => {
      const record: PipelineMetricRecord = {
        namespace: context.namespace,
        service: context.serviceName,
        metric_name: entry.name,
        metric_unit: entry.unit,
        metric_value: entry.value,
        timestamp: new Date(entry.timestamp).toISOString(),
        // Spread dimensions as top-level named fields
        ...entry.dimensions,
      };

      if (context.correlationId) {
        record["correlation_id"] = context.correlationId;
      }

      return record;
    });
  }
}
