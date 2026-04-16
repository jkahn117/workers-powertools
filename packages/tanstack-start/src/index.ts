/**
 * @workers-powertools/tanstack-start
 *
 * TanStack Start middleware adapters for Workers Powertools utilities.
 *
 * @example
 * ```ts
 * import { injectObservability } from "@workers-powertools/tanstack-start";
 * import { logger } from "./lib/logger";
 * import { tracer } from "./lib/tracer";
 *
 * export const middleware = injectObservability({ logger, tracer });
 * ```
 */

export { injectLogger } from "./logger";
export { injectTracer, injectServerFnTracer } from "./tracer";
export { injectMetrics, getMetricsBackendFromEnv } from "./metrics";
export { injectObservability } from "./observability";
export { withStartRequestObservability } from "./requestHelper";
export type {
  InjectLoggerOptions,
  InjectTracerOptions,
  InjectMetricsOptions,
  InjectObservabilityOptions,
  InjectServerFnTracerOptions,
  StartRequestContext,
  StartRequestArgs,
} from "./types";
