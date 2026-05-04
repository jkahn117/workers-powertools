import type { MiddlewareHandler } from "astro";
import type { Logger, WideEvent } from "@workers-powertools/logger";
import type { Metrics, MetricsBackend } from "@workers-powertools/metrics";
import type { Tracer } from "@workers-powertools/tracer";

export interface AstroObservabilityLocals {
  cfContext?: ExecutionContext;
  logger?: Logger;
  /** @deprecated Use `wideEvent` instead of the tracer. */
  tracer?: Tracer;
  metrics?: Metrics;
  correlationId?: string;
  wideEvent?: WideEvent;
}

export interface InjectLoggerOptions {
  logger: Logger;
  runtimeEnv: Record<string, unknown>;
  componentName?: string;
  /**
   * When true, creates a request-scoped wide event stored on
   * `context.locals.wideEvent` and auto-emits it after the handler.
   */
  wideEvent?: boolean | string | ((request: Request, routePattern: string) => string);
}

export interface InjectTracerOptions {
  /** @deprecated The tracer module is deprecated. Use wide events instead. */
  tracer: Tracer;
  runtimeEnv: Record<string, unknown>;
  requestSpanName?: string | ((request: Request, routePattern: string) => string);
}

export interface InjectMetricsOptions {
  metrics: Metrics;
  runtimeEnv: Record<string, unknown>;
  metricsBackendFactory?: (env: Record<string, unknown>) => MetricsBackend | undefined;
  captureHttpMetrics?: boolean;
}

export interface InjectObservabilityOptions {
  logger: Logger;
  /** @deprecated The tracer is deprecated. Pass `wideEvent: true` instead. */
  tracer?: Tracer;
  runtimeEnv: Record<string, unknown>;
  metrics?: Metrics;
  metricsBackendFactory?: (env: Record<string, unknown>) => MetricsBackend | undefined;
  captureHttpMetrics?: boolean;
  /** @deprecated Use `wideEvent` instead. */
  requestSpanName?: string | ((request: Request, routePattern: string) => string);
  componentName?: string;
  wideEvent?: boolean | string | ((request: Request, routePattern: string) => string);
}

export type AstroMiddleware = MiddlewareHandler;
