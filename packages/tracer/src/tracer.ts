import { PowertoolsBase, extractCorrelationId } from "@workers-powertools/commons";
import type { TracerConfig, SpanContext } from "./types";

/**
 * Trace enrichment utility for Cloudflare Workers.
 *
 * Complements Workers' built-in automatic tracing with correlation
 * ID management, custom application-level spans, and outbound
 * fetch instrumentation for trace context propagation.
 */
export class Tracer extends PowertoolsBase {
  private correlationId?: string;
  private readonly propagateCorrelationId: boolean;
  private readonly propagationHeaders: Record<string, string>;
  private readonly config: TracerConfig;

  constructor(config?: TracerConfig) {
    super(config);
    this.config = config ?? {};
    this.propagateCorrelationId = config?.propagateCorrelationId ?? true;
    this.propagationHeaders = { ...config?.propagationHeaders };
  }

  /**
   * Enrich the tracer with context from the current request.
   * Extracts or generates a correlation ID.
   *
   * Pass the Workers `env` object as the third argument to apply
   * runtime configuration from environment variables:
   *   - POWERTOOLS_SERVICE_NAME — overrides the constructor serviceName
   *
   * @example
   * export default {
   *   async fetch(request, env, ctx) {
   *     tracer.addContext(request, ctx, env);
   *   }
   * }
   */
  addContext(
    request: Request,
    _ctx?: ExecutionContext,
    env?: Record<string, unknown>,
  ): void {
    if (env && !this.config.serviceName) {
      const envService = env["POWERTOOLS_SERVICE_NAME"];
      if (typeof envService === "string" && envService) {
        (this as unknown as { serviceName: string }).serviceName = envService;
      }
    }

    this.correlationId = extractCorrelationId(request, this.config.correlationIdConfig);
  }

  /** Explicitly set the correlation ID (e.g., from a custom header). */
  setCorrelationId(id: string | null | undefined): void {
    if (id) {
      this.correlationId = id;
    }
  }

  /** Get the current correlation ID. */
  getCorrelationId(): string | undefined {
    return this.correlationId;
  }

  /**
   * Create a custom span around an async operation.
   * Records timing, annotations, and error state.
   */
  async captureAsync<T>(name: string, fn: (span: SpanContext) => Promise<T>): Promise<T> {
    const span: SpanContext = {
      name,
      startTime: Date.now(),
      annotations: {},
      metadata: {},
    };

    try {
      const result = await fn(span);
      span.success = true;
      return result;
    } catch (error) {
      span.success = false;
      span.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      span.endTime = Date.now();
      span.durationMs = span.endTime - span.startTime;
      this.emitSpan(span);
    }
  }

  /**
   * Make a fetch call with automatic correlation ID propagation.
   * Injects trace context headers into the outbound request.
   */
  async captureFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);

    if (this.propagateCorrelationId && this.correlationId) {
      headers.set("x-correlation-id", this.correlationId);
      headers.set("x-request-id", this.correlationId);
    }

    // Apply any custom propagation headers
    for (const [key, value] of Object.entries(this.propagationHeaders)) {
      headers.set(key, value);
    }

    return fetch(input, { ...init, headers });
  }

  /** Attach an annotation (low-cardinality string) to the current context. */
  putAnnotation(key: string, value: string): void {
    // Annotations are logged as structured data for trace correlation.
    console.log(
      JSON.stringify({
        type: "trace_annotation",
        service: this.serviceName,
        correlation_id: this.correlationId,
        key,
        value,
      }),
    );
  }

  /** Emit a completed span as a structured log entry. */
  private emitSpan(span: SpanContext): void {
    console.log(
      JSON.stringify({
        type: "trace_span",
        service: this.serviceName,
        correlation_id: this.correlationId,
        span_name: span.name,
        start_time: new Date(span.startTime).toISOString(),
        end_time: span.endTime ? new Date(span.endTime).toISOString() : undefined,
        duration_ms: span.durationMs,
        success: span.success,
        error: span.error,
        annotations: span.annotations,
        metadata: span.metadata,
      }),
    );
  }
}
