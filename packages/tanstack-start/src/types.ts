import type { Logger, WideEvent } from "@workers-powertools/logger";
import type { Tracer } from "@workers-powertools/tracer";
import type { Metrics, MetricsBackend } from "@workers-powertools/metrics";

export interface InjectLoggerOptions {
  logger: Logger;
  componentName?: string;
  /**
   * When true, creates a request-scoped wide event on the context
   * and auto-emits it after the handler completes.
   */
  wideEvent?: boolean | string | ((request: Request) => string);
}

/** @deprecated The tracer module is deprecated. Use wide events instead. */
export interface InjectTracerOptions {
  tracer: Tracer;
  requestSpanName?: string | ((request: Request) => string);
}

export interface InjectMetricsOptions {
  metrics: Metrics;
  metricsBackendFactory?: (env: Record<string, unknown>) => MetricsBackend | undefined;
  captureHttpMetrics?: boolean;
}

export interface InjectObservabilityOptions {
  logger: Logger;
  /** @deprecated The tracer is deprecated. Pass `wideEvent: true` instead. */
  tracer?: Tracer;
  metrics?: Metrics;
  metricsBackendFactory?: (env: Record<string, unknown>) => MetricsBackend | undefined;
  /** @deprecated Use `wideEvent` instead. */
  requestSpanName?: string | ((request: Request) => string);
  captureHttpMetrics?: boolean;
  componentName?: string;
  wideEvent?: boolean | string | ((request: Request) => string);
}

/** @deprecated The tracer module is deprecated. Use wide events instead. */
export interface InjectServerFnTracerOptions {
  tracer: Tracer;
  serverFnSpanName?: string | ((name: string) => string);
}

export interface StartRequestContext {
  env: unknown;
  logger: Logger;
  /** @deprecated Use `wideEvent` instead of the tracer. */
  tracer?: Tracer;
  metrics?: Metrics;
  correlationId?: string;
  wideEvent?: WideEvent;
}

export interface StartRequestArgs<TContext> {
  request: Request;
  env: Record<string, unknown>;
  ctx: ExecutionContext;
  logger: Logger;
  /** @deprecated The tracer is deprecated. Pass `wideEvent: true` instead. */
  tracer?: Tracer;
  metrics?: Metrics;
  metricsBackendFactory?: (env: Record<string, unknown>) => MetricsBackend | undefined;
  componentName?: string;
  wideEvent?: boolean | string | ((request: Request) => string);
  buildContext?: (context: StartRequestContext) => TContext;
  handle: (args: { context: TContext }) => Promise<Response>;
}
