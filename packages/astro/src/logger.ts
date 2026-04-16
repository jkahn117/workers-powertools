import type { APIContext, MiddlewareHandler } from "astro";
import type { AstroObservabilityLocals, InjectLoggerOptions } from "./types";

function getRoutePath(context: APIContext): string {
  return context.routePattern || context.url.pathname;
}

/**
 * Astro middleware that injects logger context for each request.
 *
 * Creates a request-scoped child logger, calls `addContext` with the request,
 * Cloudflare execution context, and runtime env, then stores the logger on
 * `context.locals` for downstream pages and endpoints.
 */
export function injectLogger(options: InjectLoggerOptions): MiddlewareHandler {
  const { logger, runtimeEnv, componentName } = options;

  return async (context, next) => {
    const locals = context.locals as AstroObservabilityLocals;
    const requestLogger = logger.withComponent(componentName ?? "server").child({
      method: context.request.method,
      path: getRoutePath(context),
    });

    requestLogger.addContext(
      context.request,
      locals.cfContext as ExecutionContext,
      runtimeEnv,
    );

    locals.logger = requestLogger;

    try {
      return await next();
    } finally {
      requestLogger.clearTemporaryKeys();
    }
  };
}
