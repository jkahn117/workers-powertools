import type { PowertoolsConfig, CorrelationIdConfig } from "@workers-powertools/commons";

/**
 * Configuration for the Tracer utility.
 */
export interface TracerConfig extends PowertoolsConfig {
  /** Configuration for correlation ID extraction/generation. */
  correlationIdConfig?: CorrelationIdConfig;

  /**
   * Whether to automatically propagate correlation IDs on
   * outbound fetch calls made via tracer.captureFetch().
   * @default true
   */
  propagateCorrelationId?: boolean;

  /**
   * Custom headers to include when propagating trace context
   * on outbound requests. Merged with the defaults
   * (x-correlation-id, x-request-id).
   */
  propagationHeaders?: Record<string, string>;
}

/**
 * Options for the captureMethod() decorator factory.
 */
export interface CaptureMethodOptions {
  /**
   * Explicit span name. When omitted, defaults to "ClassName.methodName"
   * derived automatically from the class and method at decoration time.
   *
   * @example
   * @tracer.captureMethod({ name: "chargeCard" })
   * async processPayment() { ... }
   * // span_name: "chargeCard"
   */
  name?: string;

  /**
   * Whether to re-throw errors after recording them on the span.
   * Set to false only when you intentionally want to swallow errors
   * at the decorator boundary — almost always leave this as true.
   * @default true
   */
  rethrowError?: boolean;
}

/**
 * Context for a custom application-level span.
 */
export interface SpanContext {
  /** Name of the span (e.g., "processPayment", "validateInput") */
  name: string;

  /** Start timestamp (epoch ms) */
  startTime: number;

  /** End timestamp (epoch ms), set when the span completes */
  endTime?: number;

  /** Duration in ms, computed on completion */
  durationMs?: number;

  /** Custom annotations attached to the span */
  annotations: Record<string, string>;

  /** Custom metadata attached to the span */
  metadata: Record<string, unknown>;

  /** Whether the span completed successfully */
  success?: boolean;

  /** Error captured during the span, if any */
  error?: string;
}
