import type { MiddlewareHandler } from "astro";
import type { Logger } from "@workers-powertools/logger";
import type { Metrics, MetricsBackend } from "@workers-powertools/metrics";
import type { Tracer } from "@workers-powertools/tracer";

export interface AstroObservabilityLocals {
  cfContext?: ExecutionContext;
  logger?: Logger;
  tracer?: Tracer;
  metrics?: Metrics;
  correlationId?: string;
}

export interface InjectLoggerOptions {
  logger: Logger;
  runtimeEnv: Record<string, unknown>;
  componentName?: string;
}

export interface InjectTracerOptions {
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
  tracer: Tracer;
  runtimeEnv: Record<string, unknown>;
  metrics?: Metrics;
  metricsBackendFactory?: (env: Record<string, unknown>) => MetricsBackend | undefined;
  captureHttpMetrics?: boolean;
  requestSpanName?: string | ((request: Request, routePattern: string) => string);
  componentName?: string;
}

export type AstroMiddleware = MiddlewareHandler;
