import { sequence } from "astro/middleware";
import type { MiddlewareHandler } from "astro";
import type { InjectObservabilityOptions } from "./types";
import { injectLogger } from "./logger";
import { injectMetrics } from "./metrics";
import { injectTracer } from "./tracer";

/**
 * Astro middleware that combines logger, tracer, and optional metrics
 * injection in a single middleware.
 */
export function injectObservability(
  options: InjectObservabilityOptions,
): MiddlewareHandler {
  const middlewares: MiddlewareHandler[] = [
    injectLogger({
      logger: options.logger,
      runtimeEnv: options.runtimeEnv,
      componentName: options.componentName,
    }),
    injectTracer({
      tracer: options.tracer,
      runtimeEnv: options.runtimeEnv,
      requestSpanName: options.requestSpanName,
    }),
  ];

  if (options.metrics) {
    middlewares.push(
      injectMetrics({
        metrics: options.metrics,
        runtimeEnv: options.runtimeEnv,
        metricsBackendFactory: options.metricsBackendFactory,
        captureHttpMetrics: options.captureHttpMetrics,
      }),
    );
  }

  return sequence(...middlewares);
}
