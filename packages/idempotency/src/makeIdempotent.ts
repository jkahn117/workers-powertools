import type { IdempotencyConfig } from "./config";
import type { PersistenceLayer } from "./persistence";
import { extractKeyFromEvent, hashPayload } from "./utils";

/**
 * Error thrown when an idempotency conflict is detected
 * (e.g., concurrent execution with the same key).
 */
export class IdempotencyConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(`Idempotency conflict: key "${idempotencyKey}" is already being processed.`);
    this.name = "IdempotencyConflictError";
  }
}

/**
 * Wrap an async function to prevent duplicate execution.
 *
 * On first invocation for a given key, executes the function and stores
 * the result. On subsequent invocations within the TTL, returns the
 * stored result without re-executing.
 */
export function makeIdempotent<TEvent, TResult>(
  fn: (event: TEvent) => Promise<TResult>,
  options: {
    persistenceLayer: PersistenceLayer;
    config: IdempotencyConfig;
  },
): (event: TEvent) => Promise<TResult> {
  // Do NOT destructure options here — persistenceLayer may be a getter
  // that is only valid after the first request (lazy initialisation pattern).
  // Access options.persistenceLayer inside the returned function instead.

  return async (event: TEvent): Promise<TResult> => {
    const { persistenceLayer, config } = options;
    const keyValue = extractKeyFromEvent(event, config.eventKeyPath);
    const idempotencyKey = await hashPayload(keyValue);

    // Check for an existing record
    const existing = await persistenceLayer.getRecord(idempotencyKey);

    if (existing) {
      if (existing.status === "COMPLETED" && existing.result !== undefined) {
        return existing.result as TResult;
      }

      if (existing.status === "IN_PROGRESS") {
        throw new IdempotencyConflictError(idempotencyKey);
      }
    }

    // Create an IN_PROGRESS record
    const expiresAt = Date.now() + config.expiresAfterSeconds * 1000;
    await persistenceLayer.putRecord({
      idempotencyKey,
      status: "IN_PROGRESS",
      expiresAt,
      payloadHash: config.payloadValidationEnabled
        ? await hashPayload(JSON.stringify(event))
        : undefined,
    });

    try {
      const result = await fn(event);

      // Store the successful result
      await persistenceLayer.updateRecord({
        idempotencyKey,
        status: "COMPLETED",
        expiresAt,
        result,
      });

      return result;
    } catch (error) {
      // On failure, delete the record so the operation can be retried
      await persistenceLayer.deleteRecord(idempotencyKey);
      throw error;
    }
  };
}
