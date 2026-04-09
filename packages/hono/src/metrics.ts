import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { Metrics } from "@workers-powertools/metrics";
import { MetricUnit } from "@workers-powertools/metrics";

/**
 * Options for the metrics middleware.
 */
export interface InjectMetricsOptions {
  /**
   * The key on `c.env` that holds the Analytics Engine binding.
   * The middleware resolves `c.env[analyticsBindingKey]` on each request
   * and passes it to `metrics.setBinding()`.
   *
   * Must match the binding name declared in `wrangler.jsonc`.
   * @default "ANALYTICS"
   */
  analyticsBindingKey?: string;
}

/**
 * Hono middleware that instruments each request with metrics.
 *
 * Adds `route` and `method` dimensions from the matched Hono route
 * pattern, records request duration in milliseconds, and flushes all
 * collected metrics to Analytics Engine without blocking the response.
 *
 * @param metrics - A configured Metrics instance.
 * @param options - Optional configuration, including the Analytics Engine binding key.
 */
export function injectMetrics(
  metrics: Metrics,
  options?: InjectMetricsOptions,
): MiddlewareHandler {
  const analyticsBindingKey = options?.analyticsBindingKey ?? "ANALYTICS";

  return createMiddleware(async (c, next) => {
    // Resolve the Analytics Engine binding from the Hono environment.
    // The binding key defaults to "ANALYTICS" but can be customised to
    // match whatever name is declared in wrangler.jsonc.
    const binding = (c.env as Record<string, unknown>)[analyticsBindingKey];
    if (binding) {
      metrics.setBinding(binding as AnalyticsEngineDataset);
    }

    const startTime = Date.now();

    // Add the matched route pattern as a dimension for grouping.
    metrics.addDimension("route", c.req.routePath);
    metrics.addDimension("method", c.req.method);

    try {
      await next();

      // Record the HTTP status code after the handler runs.
      metrics.addDimension("status", String(c.res.status));
    } finally {
      const durationMs = Date.now() - startTime;
      metrics.addMetric("request_duration", MetricUnit.Milliseconds, durationMs);
      metrics.addMetric("request_count", MetricUnit.Count, 1);

      // Flush metrics asynchronously so the response is not delayed.
      c.executionCtx.waitUntil(metrics.flush());
    }
  });
}
