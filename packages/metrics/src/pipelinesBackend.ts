import type { MetricsBackend, MetricEntry, MetricContext } from "./types";

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
 * Each metric is emitted as a named-field JSON record with a stable schema:
 * core fields (namespace, service, metric_name, metric_unit, metric_value,
 * timestamp, correlation_id) are structured and validated by the stream,
 * while dimensions are nested under a `dimensions` JSON field for flexibility.
 *
 * This means the stream schema stays stable even as you add new dimensions —
 * no stream recreation or pipeline rebuild required. Query dimensions in R2 SQL
 * with `map_extract(dimensions, 'key')` or bracket notation.
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
  private readonly binding: PipelineBinding | undefined;

  constructor(options: PipelinesBackendOptions) {
    // Guard against undefined bindings — common when the pipeline is not yet
    // configured in wrangler.jsonc. Warn rather than throw so the Worker
    // continues to serve requests; metrics are simply not written.
    if (!options.binding) {
      console.warn(
        "[Metrics/PipelinesBackend] Pipeline binding is undefined. " +
          'Add a "pipelines" binding in wrangler.jsonc and redeploy. ' +
          "Metrics will not be recorded until the binding is configured.",
      );
    }
    this.binding = options.binding;
  }

  async write(entries: MetricEntry[], context: MetricContext): Promise<void> {
    if (!this.binding || entries.length === 0) {
      return;
    }

    const records = this.buildRecords(entries, context);
    await this.binding.send(records);
  }

  writeSync(entries: MetricEntry[], context: MetricContext): void {
    if (!this.binding || entries.length === 0) {
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
  ): Record<string, unknown>[] {
    return entries.map((entry) => {
      const record: Record<string, unknown> = {
        namespace: context.namespace,
        service: context.serviceName,
        metric_name: entry.name,
        metric_unit: entry.unit,
        metric_value: entry.value,
        timestamp: new Date(entry.timestamp).toISOString(),
      };

      if (context.correlationId) {
        record["correlation_id"] = context.correlationId;
      }

      if (Object.keys(entry.dimensions).length > 0) {
        record["dimensions"] = { ...entry.dimensions };
      }

      return record;
    });
  }
}
