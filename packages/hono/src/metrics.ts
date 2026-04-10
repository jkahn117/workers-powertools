import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type {
  Metrics,
  MetricsBackend,
  PipelineBinding,
} from "@workers-powertools/metrics";
import { MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";

/**
 * Options for the injectMetrics middleware.
 */
export interface InjectMetricsOptions {
  /**
   * Factory function called once per request to construct the backend
   * from the Hono environment. Receives c.env so bindings are available.
   *
   * Defaults to a PipelinesBackend resolved from env.METRICS_PIPELINE
   * if that binding exists, otherwise no backend is set and a warning
   * is emitted.
   *
   * @example
   * // Pipelines (recommended)
   * backendFactory: (env) => new PipelinesBackend({ binding: env.METRICS_PIPELINE })
   *
   * // Analytics Engine (explicit opt-in — see AnalyticsEngineBackend docs)
   * backendFactory: (env) => new AnalyticsEngineBackend({ binding: env.ANALYTICS })
   */
  backendFactory?: (env: Record<string, unknown>) => MetricsBackend;
}

/**
 * Hono middleware that instruments each request with business metrics.
 *
 * Resolves the metrics backend per-request via backendFactory (so env
 * bindings are available), adds route and method dimensions, records
 * request duration, and flushes asynchronously via ctx.waitUntil.
 *
 * The default backendFactory resolves a PipelinesBackend from
 * env.METRICS_PIPELINE. Override backendFactory for custom backends
 * or a different binding name.
 *
 * @example
 * // Default — uses env.METRICS_PIPELINE automatically
 * app.use(injectMetrics(metrics));
 *
 * // Custom binding name
 * app.use(injectMetrics(metrics, {
 *   backendFactory: (env) => new PipelinesBackend({ binding: env.MY_PIPELINE }),
 * }));
 *
 * // Analytics Engine (opt-in)
 * app.use(injectMetrics(metrics, {
 *   backendFactory: (env) => new AnalyticsEngineBackend({ binding: env.ANALYTICS }),
 * }));
 */
export function injectMetrics(
  metrics: Metrics,
  options?: InjectMetricsOptions,
): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const env = c.env as Record<string, unknown>;

    // Resolve backend via factory, or fall back to the default Pipelines
    // binding (env.METRICS_PIPELINE) if present.
    if (options?.backendFactory) {
      metrics.setBackend(options.backendFactory(env));
    } else {
      const defaultBinding = env["METRICS_PIPELINE"];
      if (defaultBinding) {
        metrics.setBackend(
          new PipelinesBackend({
            binding: defaultBinding as PipelineBinding,
          }),
        );
      }
      // If neither factory nor default binding exist, Metrics.flush() will
      // emit a warning — no silent failure.
    }

    const startTime = Date.now();

    // Use the matched Hono route pattern (e.g. "/orders/:id") as the
    // dimension rather than the raw URL, so cardinality stays bounded.
    metrics.addDimension("route", c.req.routePath);
    metrics.addDimension("method", c.req.method);

    try {
      await next();

      metrics.addDimension("status", String(c.res.status));
    } finally {
      const durationMs = Date.now() - startTime;
      metrics.addMetric("request_duration", MetricUnit.Milliseconds, durationMs);
      metrics.addMetric("request_count", MetricUnit.Count, 1);

      // Non-blocking flush — writes happen after the response is returned.
      c.executionCtx.waitUntil(metrics.flush());
    }
  });
}
