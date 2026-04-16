import type { Logger } from "@workers-powertools/logger";
import type { Tracer } from "@workers-powertools/tracer";
import type { Metrics, MetricsBackend } from "@workers-powertools/metrics";

export interface InjectLoggerOptions {
  logger: Logger;
  componentName?: string;
}

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
  tracer: Tracer;
  metrics?: Metrics;
  metricsBackendFactory?: (env: Record<string, unknown>) => MetricsBackend | undefined;
  requestSpanName?: string | ((request: Request) => string);
  captureHttpMetrics?: boolean;
  componentName?: string;
}

export interface InjectServerFnTracerOptions {
  tracer: Tracer;
  serverFnSpanName?: string | ((name: string) => string);
}

export interface StartRequestContext {
  env: unknown;
  logger: Logger;
  tracer: Tracer;
  metrics?: Metrics;
  correlationId?: string;
}

export interface StartRequestArgs<TContext> {
  request: Request;
  env: Record<string, unknown>;
  ctx: ExecutionContext;
  logger: Logger;
  tracer: Tracer;
  metrics?: Metrics;
  metricsBackendFactory?: (env: Record<string, unknown>) => MetricsBackend | undefined;
  componentName?: string;
  buildContext?: (context: StartRequestContext) => TContext;
  handle: (args: { context: TContext }) => Promise<Response>;
}
