import { sequence } from "astro/middleware";
import type { MiddlewareHandler } from "astro";
import type { InjectObservabilityOptions } from "./types";
import { injectLogger } from "./logger";
import { injectMetrics } from "./metrics";
import { injectTracer } from "./tracer";

/**
 * Astro middleware that combines logger, optional tracer, and optional metrics
 * injection in a single middleware.
 *
 * The tracer is deprecated — pass `wideEvent: true` to use wide events
 * instead of the tracer for request instrumentation.
 */
export function injectObservability(
  options: InjectObservabilityOptions,
): MiddlewareHandler {
  const middlewares: MiddlewareHandler[] = [
    injectLogger({
      logger: options.logger,
      runtimeEnv: options.runtimeEnv,
      componentName: options.componentName,
      wideEvent: options.wideEvent,
    }),
  ];

  if (options.tracer) {
    middlewares.push(
      injectTracer({
        tracer: options.tracer,
        runtimeEnv: options.runtimeEnv,
        requestSpanName: options.requestSpanName,
      }),
    );
  }

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
