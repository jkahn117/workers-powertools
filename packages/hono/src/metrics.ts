import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { Metrics, MetricsBackend } from "@workers-powertools/metrics";
import { MetricUnit } from "@workers-powertools/metrics";
import type { PipelineBinding } from "@workers-powertools/metrics/pipelines";
import { PipelinesBackend } from "@workers-powertools/metrics/pipelines";

/**
 * Options for the injectMetrics middleware.
 */
export interface InjectMetricsOptions {
  /**
   * Factory function called once to construct the backend from the
   * Hono environment. Receives c.env so bindings are available.
   *
   * The factory is only invoked when no backend is set, or when the
   * binding reference has changed — not on every request.
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
 * Resolves the metrics backend on the first request (or when the binding
 * reference changes), records request duration and count with per-metric
 * dimensions (route, method, status), and flushes asynchronously via
 * ctx.waitUntil.
 *
 * Dimensions are passed per-metric rather than accumulated on the Metrics
 * instance, avoiding concurrency hazards when multiple requests share the
 * same isolate.
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
    }

    const startTime = Date.now();

    try {
      await next();

      const httpDimensions = {
        route: c.req.routePath,
        method: c.req.method,
        status: String(c.res.status),
      };

      metrics.addMetric(
        "request_duration",
        MetricUnit.Milliseconds,
        Date.now() - startTime,
        httpDimensions,
      );
      metrics.addMetric("request_count", MetricUnit.Count, 1, httpDimensions);
    } finally {
      c.executionCtx.waitUntil(metrics.flush());
    }
  });
}
