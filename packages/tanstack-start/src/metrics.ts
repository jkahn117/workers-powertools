import { createMiddleware } from "@tanstack/start-client-core";
import type { AnyRequestMiddleware } from "@tanstack/start-client-core";
import type { MetricsBackend } from "@workers-powertools/metrics";
import { MetricUnit } from "@workers-powertools/metrics";
import type { PipelineBinding } from "@workers-powertools/metrics/pipelines";
import { PipelinesBackend } from "@workers-powertools/metrics/pipelines";
import type { InjectMetricsOptions } from "./types";

/**
 * TanStack Start request middleware that instruments each request with
 * business metrics.
 *
 * Resolves the metrics backend on the first request (or when the binding
 * reference changes), optionally records request duration and count, and
 * flushes asynchronously via ctx.waitUntil.
 */
export function injectMetrics(options: InjectMetricsOptions): AnyRequestMiddleware {
  const { metrics, captureHttpMetrics = true } = options;

  return createMiddleware().server(async ({ request, context, next }) => {
    const ctxRecord = context as unknown as Record<string, unknown>;
    const env = (ctxRecord["env"] ?? {}) as Record<string, unknown>;

    if (options.metricsBackendFactory) {
      const backend = options.metricsBackendFactory(env);
      if (backend) {
        metrics.setBackend(backend);
      }
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

    const correlationId = ctxRecord["correlationId"] as string | undefined;
    if (correlationId) {
      metrics.setCorrelationId(correlationId);
    }

    const startTime = Date.now();

    try {
      const result = await next();

      if (captureHttpMetrics) {
        const response = result.response;
        const httpDimensions = {
          method: request.method,
          route: new URL(request.url).pathname,
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

      return result;
    } finally {
      const ctx = ctxRecord["ctx"] as ExecutionContext | undefined;
      if (ctx) {
        ctx.waitUntil(metrics.flush());
      } else {
        metrics.flushSync();
      }
    }
  });
}

/**
 * Resolve a MetricsBackend from a Worker environment object.
 *
 * Looks up `env[bindingName]` (default: `"METRICS_PIPELINE"`) and
 * returns a PipelinesBackend if the binding exists and has a `send` method.
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
