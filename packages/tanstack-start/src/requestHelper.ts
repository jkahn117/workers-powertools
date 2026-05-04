import { extractCorrelationId } from "@workers-powertools/commons";
import type { PipelineBinding } from "@workers-powertools/metrics/pipelines";
import { PipelinesBackend } from "@workers-powertools/metrics/pipelines";
import type { StartRequestArgs, StartRequestContext } from "./types";

/**
 * Low-level request helper for apps that own the Worker `fetch()` entrypoint
 * directly, outside of TanStack Start's middleware system.
 *
 * Enriches logger and optional metrics with request context, executes a
 * callback, and flushes metrics after the response is sent.
 *
 * @example
 * ```ts
 * export default {
 *   async fetch(request: Request, env: Env, ctx: ExecutionContext) {
 *     return withStartRequestObservability({
 *       request, env, ctx, logger, metrics,
 *       wideEvent: true,
 *       buildContext: ({ env, logger, metrics, wideEvent, correlationId }) => ({
 *         env, logger, metrics, wideEvent, correlationId,
 *       }),
 *       handle: async ({ context }) => appHandler(request, { context }),
 *     });
 *   },
 * };
 * ```
 */
export async function withStartRequestObservability<TContext>(
  args: StartRequestArgs<TContext>,
): Promise<Response> {
  const { request, env, ctx, logger, tracer, metrics, componentName, handle } = args;

  const requestLogger = logger.withComponent(componentName ?? "server").child({
    method: request.method,
    path: new URL(request.url).pathname,
  });

  requestLogger.addContext(request, ctx, env);

  if (tracer) {
    tracer.addContext(request, ctx, env);
  }

  const correlationId = tracer
    ? tracer.getCorrelationId()
    : extractCorrelationId(request);

  if (metrics) {
    if (args.metricsBackendFactory) {
      const backend = args.metricsBackendFactory(env);
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

    if (correlationId) {
      metrics.setCorrelationId(correlationId);
    }
  }

  let wideEvent;
  if (args.wideEvent) {
    const message =
      typeof args.wideEvent === "function"
        ? args.wideEvent(request)
        : typeof args.wideEvent === "string"
          ? args.wideEvent
          : `${request.method} ${new URL(request.url).pathname}`;

    wideEvent = requestLogger.createEvent(message);
  }

  const context: StartRequestContext = {
    env,
    logger: requestLogger,
    tracer,
    metrics,
    correlationId,
    wideEvent,
  };

  try {
    const builtContext = args.buildContext
      ? args.buildContext(context)
      : (context as TContext);
    const response = await handle({ context: builtContext });

    if (wideEvent && !wideEvent.isEmitted) {
      wideEvent.set({ status: response.status });
      wideEvent.emit();
    }

    return response;
  } finally {
    requestLogger.clearTemporaryKeys();
    if (metrics) {
      ctx.waitUntil(metrics.flush());
    }
  }
}
