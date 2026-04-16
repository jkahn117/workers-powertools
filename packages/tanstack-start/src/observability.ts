import { createMiddleware } from "@tanstack/start-client-core";
import type { AnyRequestMiddleware } from "@tanstack/start-client-core";
import type { InjectObservabilityOptions } from "./types";
import { injectLogger } from "./logger";
import { injectTracer } from "./tracer";
import { injectMetrics } from "./metrics";

/**
 * TanStack Start request middleware that combines logger, tracer, and
 * metrics injection in a single middleware.
 *
 * This is a convenience combinator that delegates to the individual
 * `injectLogger`, `injectTracer`, and `injectMetrics` middlewares.
 * For more granular control, use the individual middlewares directly.
 */
export function injectObservability(
  options: InjectObservabilityOptions,
): AnyRequestMiddleware {
  const loggerMiddleware = injectLogger({
    logger: options.logger,
    componentName: options.componentName,
  });

  const tracerMiddleware = injectTracer({
    tracer: options.tracer,
    requestSpanName: options.requestSpanName,
  });

  const metricsMiddleware = options.metrics
    ? injectMetrics({
        metrics: options.metrics,
        metricsBackendFactory: options.metricsBackendFactory,
        captureHttpMetrics: options.captureHttpMetrics,
      })
    : undefined;

  return createMiddleware()
    .middleware([
      loggerMiddleware,
      tracerMiddleware,
      ...(metricsMiddleware ? [metricsMiddleware] : []),
    ])
    .server(async ({ next }) => {
      return await next();
    });
}
