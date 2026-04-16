import type { PipelineBinding } from "@workers-powertools/metrics/pipelines";
import { PipelinesBackend } from "@workers-powertools/metrics/pipelines";
import type { StartRequestArgs, StartRequestContext } from "./types";

/**
 * Low-level request helper for apps that own the Worker `fetch()` entrypoint
 * directly, outside of TanStack Start's middleware system.
 *
 * Enriches logger/tracer/metrics with request context, executes a callback,
 * and flushes metrics after the response is sent.
 *
 * @example
 * ```ts
 * export default {
 *   async fetch(request: Request, env: Env, ctx: ExecutionContext) {
 *     return withStartRequestObservability({
 *       request, env, ctx, logger, tracer, metrics,
 *       buildContext: ({ env, logger, tracer, metrics, correlationId }) => ({
 *         env, logger, tracer, metrics, correlationId,
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
  tracer.addContext(request, ctx, env);

  const correlationId = tracer.getCorrelationId();

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

  const context: StartRequestContext = {
    env,
    logger: requestLogger,
    tracer,
    metrics,
    correlationId,
  };

  try {
    const builtContext = args.buildContext
      ? args.buildContext(context)
      : (context as TContext);
    return await handle({ context: builtContext });
  } finally {
    requestLogger.clearTemporaryKeys();
    if (metrics) {
      ctx.waitUntil(metrics.flush());
    }
  }
}
