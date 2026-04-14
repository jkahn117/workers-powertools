import { PowertoolsBase, extractCorrelationId } from "@workers-powertools/commons";
import type { TracerConfig, SpanContext, CaptureMethodOptions } from "./types";

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

  /**
   * TC39 Stage 3 method decorator factory that wraps an async class method
   * in a `captureAsync` span automatically.
   *
   * The span name defaults to "ClassName.methodName" and is derived at
   * decoration time — no runtime overhead per call. Override with the
   * `name` option when you want a custom span name.
   *
   * Works with TypeScript 5+ without `experimentalDecorators`. Do not
   * enable `experimentalDecorators` in tsconfig — that activates the
   * legacy Stage 2 decorator model which has different semantics.
   *
   * @example
   * class PaymentService {
   *   \@tracer.captureMethod()
   *   async processPayment(amount: number): Promise<Receipt> {
   *     // span: "PaymentService.processPayment"
   *     return charge(amount);
   *   }
   *
   *   \@tracer.captureMethod({ name: "chargeCard" })
   *   async internalCharge(): Promise<void> {
   *     // span: "chargeCard"
   *   }
   * }
   */
  captureMethod(options?: CaptureMethodOptions) {
    const tracer = this;
    const rethrowError = options?.rethrowError ?? true;

    return function <TArgs extends unknown[], T>(
      originalMethod: (...args: TArgs) => Promise<T>,
      context: ClassMethodDecoratorContext,
    ): (...args: TArgs) => Promise<T> {
      // context.name is available at decoration time (static, no runtime cost).
      // className is resolved via addInitializer so we get the actual class
      // name rather than a placeholder.
      const methodName = String(context.name);
      let spanName = options?.name;

      // Use addInitializer to capture the class name at instance creation.
      // This runs once per instance construction, not per method call.
      if (!spanName) {
        context.addInitializer(function (this: unknown) {
          const className =
            this != null && typeof this === "object" && "constructor" in this
              ? (this as { constructor: { name: string } }).constructor.name
              : "Unknown";
          spanName = `${className}.${methodName}`;
        });
      }

      return async function (this: unknown, ...args: TArgs): Promise<T> {
        const resolvedName = spanName ?? methodName;

        try {
          return await tracer.captureAsync(resolvedName, async () => {
            return await originalMethod.apply(this, args);
          });
        } catch (error) {
          if (rethrowError) {
            throw error;
          }
          // Span already recorded the error via captureAsync.
          return undefined as unknown as T;
        }
      };
    };
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
