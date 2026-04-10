import type { MetricsBackend, MetricEntry, MetricContext } from "./types";

/**
 * Analytics Engine limits per data point.
 */
const MAX_BLOBS = 20;
const MAX_DOUBLES = 20;

/**
 * Options for the AnalyticsEngineBackend.
 */
export interface AnalyticsEngineBackendOptions {
  /**
   * The Analytics Engine dataset binding declared in wrangler.jsonc.
   * @example env.ANALYTICS
   */
  binding: AnalyticsEngineDataset;
}

/**
 * Metrics backend that writes to Cloudflare Workers Analytics Engine.
 *
 * ⚠️ LIMITATIONS — read before using:
 *
 * 1. POSITIONAL SCHEMA. Dimensions are packed into blob1, blob2, ...
 *    in insertion order. Adding, removing, or reordering a dimension
 *    silently breaks all existing SQL queries.
 *
 * 2. NO NAMED COLUMNS. SQL queries must alias every blob positionally:
 *    `SELECT blob3 AS provider`. The mapping lives only in code and
 *    dashboard aliases — there is no declared schema.
 *
 * 3. NO SCHEMA ENFORCEMENT. Wrong field types and missing fields are
 *    silently accepted at write time and produce corrupt results at
 *    query time.
 *
 * 4. SINGLE NUMERIC VALUE PER DATA POINT. Only one metric value is
 *    written per addMetric() call (doubles[0]). Multiple values per
 *    event require separate writeDataPoint calls.
 *
 * 5. 20-DIMENSION LIMIT. AE supports a maximum of 20 blobs per data
 *    point. Exceeding this silently truncates dimensions.
 *
 * 6. DESIGNED FOR AGGREGATE TIME-SERIES. AE is optimised for high-
 *    cardinality counters (per-user, per-route) queried with GROUP BY
 *    and SUM. It is not a general-purpose event store.
 *
 * If any of the above are a concern, use PipelinesBackend instead.
 *
 * This backend is retained for users with existing Analytics Engine
 * dashboards that cannot be migrated. It is never the default.
 *
 * @example
 * ```ts
 * import { Metrics, AnalyticsEngineBackend } from "@workers-powertools/metrics";
 *
 * const metrics = new Metrics({ namespace: "ecommerce" });
 * // Explicit opt-in — see class-level limitations above
 * metrics.setBackend(new AnalyticsEngineBackend({ binding: env.ANALYTICS }));
 * ```
 */
export class AnalyticsEngineBackend implements MetricsBackend {
  private readonly binding: AnalyticsEngineDataset;

  constructor(options: AnalyticsEngineBackendOptions) {
    this.binding = options.binding;
  }

  async write(entries: MetricEntry[], context: MetricContext): Promise<void> {
    // writeDataPoint is synchronous and fire-and-forget — the async
    // signature satisfies the MetricsBackend interface contract.
    this.writeSync(entries, context);
  }

  writeSync(entries: MetricEntry[], context: MetricContext): void {
    for (const entry of entries) {
      this.writeEntry(entry, context);
    }
  }

  private writeEntry(entry: MetricEntry, context: MetricContext): void {
    const allDimensions: Record<string, string> = {
      namespace: context.namespace,
      service: context.serviceName,
      metric_name: entry.name,
      metric_unit: entry.unit,
      ...entry.dimensions,
    };

    // Pack dimensions into blobs positionally (first N keys, capped at MAX_BLOBS).
    // IMPORTANT: insertion order determines blob position. blob1, blob2, ...
    // correspond to the keys in the order they appear above. Do not change
    // this order without updating all downstream SQL queries.
    const blobKeys = Object.keys(allDimensions).slice(0, MAX_BLOBS);
    const blobs = blobKeys.map((k) => allDimensions[k] ?? "");

    const doubles = [entry.value];

    if (doubles.length > MAX_DOUBLES) {
      console.warn(
        `[Metrics/AnalyticsEngineBackend] Metric "${entry.name}" exceeds ${String(MAX_DOUBLES)} doubles limit. Truncating.`,
      );
      doubles.length = MAX_DOUBLES;
    }

    this.binding.writeDataPoint({
      blobs,
      doubles,
      indexes: [entry.name],
    });
  }
}
