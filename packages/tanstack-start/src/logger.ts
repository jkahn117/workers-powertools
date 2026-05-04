import { createMiddleware } from "@tanstack/start-client-core";
import type { AnyRequestMiddleware } from "@tanstack/start-client-core";
import type { WideEvent } from "@workers-powertools/logger";
import type { InjectLoggerOptions } from "./types";

/**
 * TanStack Start request middleware that injects logger context.
 *
 * Creates a request-scoped child logger, calls `addContext` with the
 * request and env, and clears temporary keys after the handler completes.
 *
 * When `wideEvent` is enabled, creates a request-scoped wide event
 * and passes it on the context. The event is auto-emitted after the
 * handler completes.
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

    let event: WideEvent | undefined;

    if (options.wideEvent) {
      const message =
        typeof options.wideEvent === "function"
          ? options.wideEvent(request)
          : typeof options.wideEvent === "string"
            ? options.wideEvent
            : `${request.method} ${new URL(request.url).pathname}`;

      event = requestLogger.createEvent(message);
    }

    try {
      const result = await next({
        context: {
          logger: requestLogger,
          ...(event ? { wideEvent: event } : {}),
        } as Record<string, unknown>,
      });

      if (event && !event.isEmitted) {
        const response = result.response;
        event.set({ status: response.status });
        event.emit();
      }

      return result;
    } finally {
      requestLogger.clearTemporaryKeys();
    }
  });
}
