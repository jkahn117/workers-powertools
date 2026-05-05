import type { APIContext, MiddlewareHandler } from "astro";
import type { AstroObservabilityLocals, InjectTracerOptions } from "./types";

function getRoutePath(context: APIContext): string {
  return context.routePattern || context.url.pathname;
}

/**
 * Astro middleware that injects tracer context for each request.
 *
 * @deprecated The tracer module is deprecated because Cloudflare Workers
 * does not expose an API for injecting custom spans into the built-in
 * tracing system. Use `injectLogger` with `wideEvent: true` instead.
 * For correlation ID propagation on outbound fetch, use `captureFetch`
 * from `@workers-powertools/commons`.
 */
export function injectTracer(options: InjectTracerOptions): MiddlewareHandler {
  const { tracer, runtimeEnv, requestSpanName } = options;

  return async (context, next) => {
    const locals = context.locals as AstroObservabilityLocals;
    tracer.addContext(context.request, locals.cfContext as ExecutionContext, runtimeEnv);

    const routePath = getRoutePath(context);
    const spanName =
      typeof requestSpanName === "function"
        ? requestSpanName(context.request, routePath)
        : (requestSpanName ?? `${context.request.method} ${routePath}`);

    locals.tracer = tracer;
    locals.correlationId = tracer.getCorrelationId();

    return await tracer.captureAsync(spanName, async (span) => {
      span.annotations["http.method"] = context.request.method;
      span.annotations["http.route"] = routePath;
      span.annotations["http.url"] = context.request.url;

      const response = await next();

      span.annotations["http.status"] = String(response.status);
      return response;
    });
  };
}
