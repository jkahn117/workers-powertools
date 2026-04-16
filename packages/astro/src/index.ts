/**
 * @workers-powertools/astro
 *
 * Astro middleware adapters for Workers Powertools utilities.
 */

export { injectLogger } from "./logger";
export { injectMetrics, getMetricsBackendFromEnv } from "./metrics";
export { injectTracer } from "./tracer";
export { injectObservability } from "./observability";
export type {
  AstroMiddleware,
  AstroObservabilityLocals,
  InjectLoggerOptions,
  InjectMetricsOptions,
  InjectObservabilityOptions,
  InjectTracerOptions,
} from "./types";
