import { createMiddleware } from "@tanstack/start-client-core";
import type { AnyRequestMiddleware } from "@tanstack/start-client-core";
import type { InjectLoggerOptions } from "./types";

/**
 * TanStack Start request middleware that injects logger context.
 *
 * Creates a request-scoped child logger, calls `addContext` with the
 * request and env, and clears temporary keys after the handler completes.
 */
export function injectLogger(options: InjectLoggerOptions): AnyRequestMiddleware {
  const { logger, componentName } = options;

  return createMiddleware().server(async ({ request, context, next }) => {
    const requestLogger = logger.withComponent(componentName ?? "server").child({
      method: request.method,
      path: new URL(request.url).pathname,
    });

    const ctxRecord = context as unknown as Record<string, unknown>;
    const env = (ctxRecord["env"] ?? {}) as Record<string, unknown>;

    requestLogger.addContext(request, ctxRecord["ctx"] as ExecutionContext, env);

    try {
      return await next({
        context: {
          logger: requestLogger,
        } as Record<string, unknown>,
      });
    } finally {
      requestLogger.clearTemporaryKeys();
    }
  });
}
