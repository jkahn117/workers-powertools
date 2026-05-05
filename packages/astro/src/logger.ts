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
 *
 * When `wideEvent` is enabled, creates a request-scoped wide event
 * accessible via `context.locals.wideEvent` and auto-emits it after the
 * handler completes.
 */
export function injectLogger(options: InjectLoggerOptions): MiddlewareHandler {
  const { logger, runtimeEnv, componentName } = options;

  return async (context, next) => {
    const locals = context.locals as AstroObservabilityLocals;
    const routePath = getRoutePath(context);
    const requestLogger = logger.withComponent(componentName ?? "server").child({
      method: context.request.method,
      path: routePath,
    });

    requestLogger.addContext(
      context.request,
      locals.cfContext as ExecutionContext,
      runtimeEnv,
    );

    locals.logger = requestLogger;

    if (options.wideEvent) {
      const message =
        typeof options.wideEvent === "function"
          ? options.wideEvent(context.request, routePath)
          : typeof options.wideEvent === "string"
            ? options.wideEvent
            : `${context.request.method} ${routePath}`;

      locals.wideEvent = requestLogger.createEvent(message);
    }

    try {
      const response = await next();

      if (locals.wideEvent && !locals.wideEvent.isEmitted) {
        locals.wideEvent.set({ status: response.status });
        locals.wideEvent.emit();
      }

      return response;
    } finally {
      requestLogger.clearTemporaryKeys();
    }
  };
}
