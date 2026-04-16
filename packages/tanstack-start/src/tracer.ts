import { createMiddleware } from "@tanstack/start-client-core";
import type {
  AnyRequestMiddleware,
  AnyFunctionMiddleware,
} from "@tanstack/start-client-core";
import type { InjectTracerOptions, InjectServerFnTracerOptions } from "./types";

/**
 * TanStack Start request middleware that injects tracer context.
 *
 * Extracts the correlation ID from the incoming request, then wraps
 * the downstream handler in a `captureAsync` span.
 */
export function injectTracer(options: InjectTracerOptions): AnyRequestMiddleware {
  const { tracer, requestSpanName } = options;

  return createMiddleware().server(async ({ request, context, next }) => {
    const ctxRecord = context as unknown as Record<string, unknown>;
    const env = (ctxRecord["env"] ?? {}) as Record<string, unknown>;

    tracer.addContext(request, ctxRecord["ctx"] as ExecutionContext, env);

    const spanName =
      typeof requestSpanName === "function"
        ? requestSpanName(request)
        : (requestSpanName ?? `${request.method} ${new URL(request.url).pathname}`);

    const result = await tracer.captureAsync(spanName, async (span) => {
      span.annotations["http.method"] = request.method;
      span.annotations["http.url"] = request.url;

      const nextResult = await next({
        context: {
          tracer,
          correlationId: tracer.getCorrelationId(),
        } as Record<string, unknown>,
      });

      const response = nextResult.response;
      span.annotations["http.status"] = String(response.status);

      return nextResult;
    });

    return result;
  });
}

/**
 * TanStack Start server function middleware that creates a span
 * around each server function call.
 *
 * Reuses the tracer and correlation ID from upstream request middleware
 * when available. Does not create a second metrics backend lifecycle.
 */
export function injectServerFnTracer(
  options: InjectServerFnTracerOptions,
): AnyFunctionMiddleware {
  const { tracer, serverFnSpanName } = options;

  return createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
    const fnName = serverFnMeta?.name ?? "unknown";
    const spanName =
      typeof serverFnSpanName === "function"
        ? serverFnSpanName(fnName)
        : (serverFnSpanName ?? `serverFn.${fnName}`);

    return await tracer.captureAsync(spanName, async (span) => {
      span.annotations["serverFn.name"] = fnName;
      return await next();
    });
  });
}
