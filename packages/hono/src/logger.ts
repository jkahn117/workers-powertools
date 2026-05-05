import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { Logger, WideEvent } from "@workers-powertools/logger";

export interface InjectLoggerOptions {
  /**
   * When true, the middleware creates a request-scoped wide event
   * and stores it on `c.set("wideEvent")`. The event is auto-emitted
   * with `duration_ms` after the handler completes.
   *
   * Pass a string to customise the wide event's summary message,
   * or a function `(c) => string` for dynamic messages. Defaults
   * to `"<METHOD> <routePath>"`.
   */
  wideEvent?: boolean | string | ((request: Request, routePath: string) => string);
}

/** Hono variable types added when wide events are enabled. */
export interface WideEventVariables {
  wideEvent: WideEvent;
}

/**
 * Hono middleware that injects logger context for each request.
 *
 * Calls `logger.addContext` with the raw request and execution
 * context, then clears temporary keys once the handler completes.
 *
 * When `wideEvent` is enabled, creates a request-scoped wide event
 * accessible via `c.get("wideEvent")` and auto-emits it after the
 * handler. This replaces scattered log calls with a single
 * information-dense log entry per request.
 *
 * @param logger - A configured Logger instance.
 * @param options - Optional settings including wide event support.
 */
export function injectLogger(
  logger: Logger,
  options?: InjectLoggerOptions,
): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    logger.resetContext();
    logger.addContext(
      c.req.raw,
      c.executionCtx as unknown as ExecutionContext,
      c.env as unknown as Record<string, unknown>,
    );

    let event: WideEvent | undefined;

    if (options?.wideEvent) {
      const routePath = c.req.routePath;
      const message =
        typeof options.wideEvent === "function"
          ? options.wideEvent(c.req.raw, routePath)
          : typeof options.wideEvent === "string"
            ? options.wideEvent
            : `${c.req.method} ${routePath}`;

      event = logger.createEvent(message);
      c.set("wideEvent", event);
    }

    try {
      await next();

      if (event && !event.isEmitted) {
        event.set({ status: c.res.status });
        event.emit();
      }
    } finally {
      logger.clearTemporaryKeys();
    }
  });
}
