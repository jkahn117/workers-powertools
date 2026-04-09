/**
 * @workers-powertools/hono
 *
 * Hono middleware adapters for all Workers Powertools utilities.
 *
 * @example
 * ```ts
 * import { Logger } from "@workers-powertools/logger";
 * import { injectLogger } from "@workers-powertools/hono";
 *
 * const logger = new Logger({ serviceName: "my-worker" });
 * app.use(injectLogger(logger));
 * ```
 */

export { injectLogger } from "./logger";
export { injectMetrics } from "./metrics";
export { injectTracer } from "./tracer";
export { injectIdempotency } from "./idempotency";
export type { InjectIdempotencyOptions } from "./idempotency";
export type { InjectMetricsOptions } from "./metrics";
