import { createMiddleware } from "@tanstack/start-client-core";
import type { AnyRequestMiddleware } from "@tanstack/start-client-core";
import type { InjectObservabilityOptions } from "./types";
import { injectLogger } from "./logger";
import { injectTracer } from "./tracer";
import { injectMetrics } from "./metrics";

/**
 * TanStack Start request middleware that combines logger, optional tracer,
 * and metrics injection in a single middleware.
 *
 * The tracer is deprecated — pass `wideEvent: true` to use wide events
 * instead of the tracer for request instrumentation.
 */
export function injectObservability(
  options: InjectObservabilityOptions,
): AnyRequestMiddleware {
  const loggerMiddleware = injectLogger({
    logger: options.logger,
    componentName: options.componentName,
    wideEvent: options.wideEvent,
  });

  const middlewares: AnyRequestMiddleware[] = [loggerMiddleware];

  if (options.tracer) {
    middlewares.push(
      injectTracer({
        tracer: options.tracer,
        requestSpanName: options.requestSpanName,
      }),
    );
  }

  if (options.metrics) {
    middlewares.push(
      injectMetrics({
        metrics: options.metrics,
        metricsBackendFactory: options.metricsBackendFactory,
        captureHttpMetrics: options.captureHttpMetrics,
      }),
    );
  }

  return createMiddleware()
    .middleware(middlewares)
    .server(async ({ next }) => {
      return await next();
    });
}
