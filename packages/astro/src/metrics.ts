import type { APIContext, MiddlewareHandler } from "astro";
import { MetricUnit } from "@workers-powertools/metrics";
import type { MetricsBackend } from "@workers-powertools/metrics";
import { PipelinesBackend } from "@workers-powertools/metrics/pipelines";
import type { PipelineBinding } from "@workers-powertools/metrics/pipelines";
import type { AstroObservabilityLocals, InjectMetricsOptions } from "./types";

function getRoutePath(context: APIContext): string {
  return context.routePattern || context.url.pathname;
}

/**
 * Astro middleware that instruments each request with business metrics.
 *
 * Resolves the metrics backend from the runtime env, records request duration
 * and count with route/method/status dimensions, then flushes asynchronously
 * via `cfContext.waitUntil()` when available.
 */
export function injectMetrics(options: InjectMetricsOptions): MiddlewareHandler {
  const {
    metrics,
    runtimeEnv,
    metricsBackendFactory,
    captureHttpMetrics = true,
  } = options;

  return async (context, next) => {
    const locals = context.locals as AstroObservabilityLocals;
    if (metricsBackendFactory) {
      const backend = metricsBackendFactory(runtimeEnv);
      if (backend) {
        metrics.setBackend(backend);
      }
    } else {
      const backend = getMetricsBackendFromEnv(runtimeEnv);
      if (backend) {
        metrics.setBackend(backend);
      }
    }

    locals.metrics = metrics;

    if (locals.correlationId) {
      metrics.setCorrelationId(locals.correlationId);
    }

    const startTime = Date.now();

    try {
      const response = await next();

      if (captureHttpMetrics) {
        const httpDimensions = {
          method: context.request.method,
          route: getRoutePath(context),
          status: String(response.status),
        };

        metrics.addMetric(
          "request_duration",
          MetricUnit.Milliseconds,
          Date.now() - startTime,
          httpDimensions,
        );
        metrics.addMetric("request_count", MetricUnit.Count, 1, httpDimensions);
      }

      return response;
    } finally {
      if (locals.cfContext) {
        locals.cfContext.waitUntil(metrics.flush());
      } else {
        metrics.flushSync();
      }
    }
  };
}

/**
 * Resolve a MetricsBackend from a Cloudflare runtime env object.
 *
 * Looks up `env[bindingName]` (default: `"METRICS_PIPELINE"`) and returns a
 * `PipelinesBackend` if the binding exists and has a `send` method.
 */
export function getMetricsBackendFromEnv(
  env: Record<string, unknown>,
  options?: { bindingName?: string },
): MetricsBackend | undefined {
  const bindingName = options?.bindingName ?? "METRICS_PIPELINE";
  const binding = env[bindingName];

  if (!binding || typeof binding !== "object" || !("send" in (binding as object))) {
    return undefined;
  }

  return new PipelinesBackend({ binding: binding as PipelineBinding });
}
