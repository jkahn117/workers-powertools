import { PowertoolsBase } from "@workers-powertools/commons";
import type { MetricsConfig, MetricEntry, MetricsBackend, MetricContext } from "./types";
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
 *
 * Concurrency safety: dimensions are passed per-metric via addMetric()
 * rather than accumulated on the instance. This avoids shared mutable
 * state that would be clobbered by concurrent requests in the same
 * Workers isolate. Use defaultDimensions for static dimensions (environment,
 * version) that apply to every metric.
 */
export class Metrics extends PowertoolsBase {
  private readonly namespace: string;
  private readonly defaultDimensions: Record<string, string>;
  private readonly entries: MetricEntry[] = [];
  private readonly autoFlush: boolean;
  private backend: MetricsBackend | undefined;
  private correlationId: string | undefined;

  constructor(config?: MetricsConfig) {
    super(config);

    this.namespace = this.resolveConfig(
      config?.namespace,
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
   * If the new backend wraps the same binding reference as the current
   * one, the call is skipped — avoiding unnecessary object creation
   * on every request when the binding doesn't change.
   *
   * @example
   * // Pipelines (recommended)
   * metrics.setBackend(new PipelinesBackend({ binding: env.METRICS_PIPELINE }));
   *
   * // Analytics Engine (explicit opt-in — see AnalyticsEngineBackend docs)
   * metrics.setBackend(new AnalyticsEngineBackend({ binding: env.ANALYTICS }));
   */
  setBackend(backend: MetricsBackend): void {
    if (
      this.backend &&
      typeof (this.backend as unknown as Record<string, unknown>)["binding"] ===
        "object" &&
      (this.backend as unknown as Record<string, unknown>)["binding"] ===
        (backend as unknown as Record<string, unknown>)["binding"]
    ) {
      return;
    }
    this.backend = backend;
  }

  /**
   * Set the correlation ID for the current request context.
   *
   * Included in the MetricContext passed to backends on every flush,
   * so metrics and logs can be correlated in the same query.
   * Cleared automatically after each flush.
   */
  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  /**
   * Record a named business metric with per-call dimensions.
   *
   * Dimensions are passed explicitly per metric rather than accumulated
   * on the instance. This avoids shared mutable state that would be
   * clobbered by concurrent requests in the same Workers isolate.
   *
   * The entry's final dimensions are: defaultDimensions merged with
   * the per-call dimensions (per-call keys override defaults).
   *
   * In buffered mode (default), the entry is queued until flush() or
   * flushSync() is called. In autoFlush mode, it is written immediately.
   *
   * @example
   * metrics.addMetric("successfulBooking", MetricUnit.Count, 1, { paymentMethod: "card" });
   * metrics.addMetric("orderLatency", MetricUnit.Milliseconds, 142, { route: "/orders" });
   * metrics.addMetric("itemCreated", MetricUnit.Count, 1);
   */
  addMetric(
    name: string,
    unit: MetricUnit,
    value: number,
    dimensions?: Record<string, string>,
  ): void {
    const entry: MetricEntry = {
      name,
      unit,
      value,
      dimensions: {
        ...this.defaultDimensions,
        ...dimensions,
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
    const context = this.buildContext();
    this.clearEntries();

    await this.backend!.write(toWrite, context);
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
    const context = this.buildContext();
    this.clearEntries();

    this.backend!.writeSync(toWrite, context);
  }

  private writeSingle(entry: MetricEntry): void {
    if (!this.assertBackend()) {
      return;
    }
    this.backend!.writeSync([entry], this.buildContext());
  }

  private buildContext(): MetricContext {
    const context: MetricContext = {
      namespace: this.namespace,
      serviceName: this.serviceName,
    };

    if (this.correlationId) {
      context.correlationId = this.correlationId;
    }

    return context;
  }

  private clearEntries(): void {
    this.entries.length = 0;
    this.correlationId = undefined;
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
