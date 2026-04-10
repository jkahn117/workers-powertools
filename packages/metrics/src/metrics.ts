import { PowertoolsBase } from "@workers-powertools/commons";
import type { MetricsConfig, MetricEntry, MetricsBackend } from "./types";
import type { MetricUnit } from "./units";

/**
 * Business metrics utility for Cloudflare Workers.
 *
 * Provides an ergonomic API for emitting named business metrics
 * (successfulBooking, deckGenerated, failedPayment) with a namespace,
 * dimensions, and units — modelled after Lambda Powertools Metrics.
 *
 * The default backend is Cloudflare Pipelines (→ R2/Iceberg), which
 * writes named-field JSON records queryable by column name. The
 * AnalyticsEngineBackend is available as an explicit opt-in for users
 * with existing Analytics Engine dashboards.
 *
 * Do not use this utility to re-emit infrastructure signals that the
 * Workers platform already provides for free (request count, CPU time,
 * error rate, p99 latency). Those are available via the Workers Metrics
 * dashboard and GraphQL API at zero cost.
 *
 * Two flush modes:
 * - **Buffered (default):** metrics are queued and written together.
 *   In fetch handlers call ctx.waitUntil(metrics.flush()).
 *   In DO contexts with this.ctx, call this.ctx.waitUntil(metrics.flush()).
 *   Without ExecutionContext, call metrics.flushSync().
 * - **Auto-flush:** set autoFlush: true to write each metric immediately
 *   on addMetric(). Use in alarm handlers and queue consumers.
 */
export class Metrics extends PowertoolsBase {
  private readonly namespace: string;
  private readonly defaultDimensions: Record<string, string>;
  private readonly entries: MetricEntry[] = [];
  private requestDimensions: Record<string, string> = {};
  private readonly autoFlush: boolean;
  private backend: MetricsBackend | undefined;

  constructor(config?: MetricsConfig) {
    super(config);

    // Resolve namespace: constructor → env var → default
    this.namespace = this.resolveConfig(
      config?.namespace,
      // In Workers, env vars are accessed via bindings, not process.env.
      // We read from globalThis for test compatibility; in production
      // this will typically be undefined and the constructor value used.
      typeof globalThis !== "undefined"
        ? ((globalThis as Record<string, unknown>)["POWERTOOLS_METRICS_NAMESPACE"] as
            | string
            | undefined)
        : undefined,
      "default_namespace",
    );

    this.defaultDimensions = { ...config?.defaultDimensions };
    this.autoFlush = config?.autoFlush ?? false;
    this.backend = config?.backend;
  }

  /**
   * Set or replace the metrics backend.
   *
   * Call this in your fetch handler (or per-request in Hono middleware)
   * after the env binding is available.
   *
   * @example
   * // Pipelines (recommended)
   * metrics.setBackend(new PipelinesBackend({ binding: env.METRICS_PIPELINE }));
   *
   * // Analytics Engine (explicit opt-in — see AnalyticsEngineBackend docs)
   * metrics.setBackend(new AnalyticsEngineBackend({ binding: env.ANALYTICS }));
   */
  setBackend(backend: MetricsBackend): void {
    this.backend = backend;
  }

  /**
   * Add a dimension scoped to the current request or operation.
   * Merged with defaultDimensions on each addMetric() call.
   */
  addDimension(key: string, value: string): void {
    this.requestDimensions[key] = value;
  }

  /**
   * Record a named business metric.
   *
   * In buffered mode (default), the entry is queued until flush() or
   * flushSync() is called. In autoFlush mode, it is written immediately.
   *
   * @example
   * metrics.addMetric("successfulBooking", MetricUnit.Count, 1);
   * metrics.addMetric("orderLatency", MetricUnit.Milliseconds, 142);
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
      this.writeSingle(entry);
    } else {
      this.entries.push(entry);
    }
  }

  /**
   * Flush all buffered metrics via the configured backend.
   *
   * Returns a Promise so it can be used with ctx.waitUntil():
   *   ctx.waitUntil(metrics.flush())
   *
   * No-op when autoFlush is true — metrics are already written on addMetric().
   * No-op when no entries are buffered.
   */
  async flush(): Promise<void> {
    if (!this.assertBackend()) {
      return;
    }

    if (this.entries.length === 0) {
      return;
    }

    const toWrite = [...this.entries];
    this.clearEntries();

    await this.backend!.write(toWrite, this.buildContext());
  }

  /**
   * Synchronously flush all buffered metrics (fire-and-forget).
   *
   * Safe to call in Durable Object RPC methods and alarm handlers where
   * ExecutionContext is not always available. The backend's writeSync()
   * implementation handles async delivery internally.
   *
   * No-op when autoFlush is true.
   * No-op when no entries are buffered.
   */
  flushSync(): void {
    if (!this.assertBackend()) {
      return;
    }

    if (this.entries.length === 0) {
      return;
    }

    const toWrite = [...this.entries];
    this.clearEntries();

    this.backend!.writeSync(toWrite, this.buildContext());
  }

  private writeSingle(entry: MetricEntry): void {
    if (!this.assertBackend()) {
      return;
    }
    this.backend!.writeSync([entry], this.buildContext());
  }

  private buildContext() {
    return {
      namespace: this.namespace,
      serviceName: this.serviceName,
    };
  }

  private clearEntries(): void {
    this.entries.length = 0;
    this.requestDimensions = {};
  }

  private assertBackend(): boolean {
    if (!this.backend) {
      console.warn(
        "[Metrics] No backend configured. Call setBackend() with a PipelinesBackend or AnalyticsEngineBackend before flushing.",
      );
      return false;
    }
    return true;
  }
}
