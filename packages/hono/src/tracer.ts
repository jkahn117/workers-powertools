import { createMiddleware } from "hono/factory";
import type { Tracer } from "@workers-powertools/tracer";

/**
 * Hono middleware that injects tracer context for each request.
 *
 * @deprecated The tracer module is deprecated because Cloudflare Workers
 * does not expose an API for injecting custom spans into the built-in
 * tracing system. The spans emitted by the tracer are structured log
 * entries, not real trace spans in the Workers trace waterfall.
 *
 * Use `injectLogger` instead. For correlation ID propagation on outbound
 * fetch, use `captureFetch` from `@workers-powertools/commons`.
 *
 * @param tracer - A configured Tracer instance.
 */
export function injectTracer(tracer: Tracer) {
  return createMiddleware(async (c, next) => {
    tracer.addContext(
      c.req.raw,
      c.executionCtx as unknown as ExecutionContext,
      c.env as unknown as Record<string, unknown>,
    );

    const spanName = `${c.req.method} ${c.req.routePath}`;

    await tracer.captureAsync(spanName, async (span) => {
      span.annotations["http.method"] = c.req.method;
      span.annotations["http.route"] = c.req.routePath;
      span.annotations["http.url"] = c.req.url;

      await next();

      span.annotations["http.status"] = String(c.res.status);
    });
  });
}
