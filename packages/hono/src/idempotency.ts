import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import { makeIdempotent, IdempotencyConfig } from "@workers-powertools/idempotency";
import type { PersistenceLayer } from "@workers-powertools/idempotency";

/**
 * Options for the idempotency middleware.
 */
export interface InjectIdempotencyOptions {
  /** Persistence layer for storing idempotency records (KV, D1, etc.). */
  persistenceLayer: PersistenceLayer;

  /** Configuration for key extraction and TTL. */
  config: IdempotencyConfig;

  /**
   * Header name that carries the idempotency key.
   * @default "idempotency-key"
   */
  headerName?: string;
}

/**
 * Hono middleware that checks idempotency before the handler runs.
 *
 * If a matching completed record exists in the persistence layer,
 * the stored response is returned immediately without executing the
 * downstream handler. Concurrent duplicate requests receive a 409.
 *
 * @param options - Idempotency configuration, persistence layer, and optional header name.
 */
export function injectIdempotency(options: InjectIdempotencyOptions): MiddlewareHandler {
  const { config, headerName = "idempotency-key" } = options;

  return createMiddleware(async (c, next) => {
    const idempotencyKey = c.req.header(headerName);

    // If no idempotency key header is present, skip the check
    // and let the request proceed normally.
    if (!idempotencyKey) {
      await next();
      return;
    }

    // Track whether the handler actually ran so we know if the result
    // came from cache or a live execution.
    let handlerRan = false;

    const idempotentHandler = makeIdempotent(
      async (_event: { key: string }) => {
        handlerRan = true;
        await next();

        // Capture the response body and status to store as the result.
        const body = await c.res.clone().text();
        const status = c.res.status;
        const contentType = c.res.headers.get("content-type") ?? "application/json";

        return { body, status, contentType };
      },
      {
        get persistenceLayer() {
          return options.persistenceLayer;
        },
        // Wrap the key string in an object so extractKeyFromEvent can
        // traverse it with a simple dot-notation path.
        config: new IdempotencyConfig({
          eventKeyPath: "key",
          expiresAfterSeconds: config.expiresAfterSeconds,
          payloadValidationEnabled: config.payloadValidationEnabled,
        }),
      },
    );

    try {
      const result = await idempotentHandler({ key: idempotencyKey });

      // If the result came from cache (handler did not run this time),
      // reconstruct the response from the stored data.
      if (!handlerRan) {
        c.res = new Response(result.body, {
          status: result.status,
          headers: { "content-type": result.contentType },
        });
      }
    } catch (error) {
      // IdempotencyConflictError means a duplicate request is
      // already in progress — return 409 Conflict.
      if (error instanceof Error && error.name === "IdempotencyConflictError") {
        c.res = new Response(
          JSON.stringify({ error: "Request is already being processed" }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        );
        return;
      }
      throw error;
    }
  });
}
