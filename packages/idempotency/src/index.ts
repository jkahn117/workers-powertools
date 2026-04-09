/**
 * @workers-powertools/idempotency
 *
 * Exactly-once execution with pluggable persistence for
 * Cloudflare Workers. Prevents duplicate processing of
 * webhooks, queue messages, and other at-least-once events.
 */

export { makeIdempotent } from "./makeIdempotent";
export { IdempotencyConfig } from "./config";
export type {
  PersistenceLayer,
  IdempotencyRecord,
  IdempotencyStatus,
} from "./persistence";
