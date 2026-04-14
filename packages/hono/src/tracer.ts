import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { Tracer } from "@workers-powertools/tracer";

/**
 * Hono middleware that injects tracer context for each request.
 *
 * Extracts the correlation ID from the incoming request, then
 * wraps the downstream handler in a `captureAsync` span named
 * after the HTTP method and matched route pattern.
 *
 * @param tracer - A configured Tracer instance.
 */
export function injectTracer(tracer: Tracer): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    // Extract correlation ID and enrich the tracer.
    tracer.addContext(c.req.raw, c.executionCtx as unknown as ExecutionContext);

    const spanName = `${c.req.method} ${c.req.routePath}`;

    await tracer.captureAsync(spanName, async (span) => {
      // Annotate the span with useful request metadata.
      span.annotations["http.method"] = c.req.method;
      span.annotations["http.route"] = c.req.routePath;
      span.annotations["http.url"] = c.req.url;

      await next();

      // Capture the response status after the handler runs.
      span.annotations["http.status"] = String(c.res.status);
    });
  });
}
