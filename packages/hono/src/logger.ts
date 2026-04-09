import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { Logger } from "@workers-powertools/logger";

/**
 * Hono middleware that injects logger context for each request.
 *
 * Calls `logger.addContext` with the raw request and execution
 * context, then clears temporary keys once the handler completes.
 *
 * @param logger - A configured Logger instance.
 */
export function injectLogger(logger: Logger): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    // Enrich the logger with CF properties, correlation ID, etc.
    logger.addContext(c.req.raw, c.executionCtx);

    try {
      await next();
    } finally {
      // Clear per-request temporary keys so they don't leak
      // into subsequent requests when the logger is reused.
      logger.clearTemporaryKeys();
    }
  });
}
