import type { PowertoolsConfig, CorrelationIdConfig } from "@workers-powertools/commons";
import type { RedactConfig } from "./redact";

/** Supported log levels, ordered by severity. */
export type LogLevel =
  | "TRACE"
  | "DEBUG"
  | "INFO"
  | "WARN"
  | "ERROR"
  | "CRITICAL"
  | "SILENT";

/** Numeric mapping for log level comparison. */
export const LOG_LEVEL_VALUE: Record<LogLevel, number> = {
  TRACE: 0,
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  CRITICAL: 50,
  SILENT: 100,
};

/**
 * Configuration for the Logger utility.
 */
export interface LoggerConfig extends PowertoolsConfig {
  /** Minimum log level to emit. Defaults to "INFO". */
  logLevel?: LogLevel;

  /**
   * Key-value pairs appended to every log entry.
   * Useful for environment, version, deployment ID, etc.
   */
  persistentKeys?: Record<string, unknown>;

  /** Configuration for correlation ID extraction. */
  correlationIdConfig?: CorrelationIdConfig;

  /**
   * Percentage of requests (0-1) that should log at DEBUG level
   * regardless of the configured logLevel. This is independent of
   * the wrangler head_sampling_rate which controls whether a request
   * is logged at all.
   * @default 0
   */
  debugSampleRate?: number;

  /**
   * Two-tier sampling: percentage of requests (0-1) for which non-error
   * logs (TRACE through WARN) are emitted. ERROR and CRITICAL always
   * emit regardless of this setting.
   *
   * Set to 1 (default) to emit all logs. Set to 0.1 to emit non-error
   * logs for only 10% of requests while still capturing every error.
   * @default 1
   */
  sampleRate?: number;

  /**
   * When true, buffer logs below the configured level and flush
   * them all if an error occurs during the request. Flushed via
   * ctx.waitUntil to avoid blocking the response.
   * @default false
   */
  logBufferingEnabled?: boolean;

  /**
   * Maximum number of log entries to keep in the buffer when
   * `logBufferingEnabled` is true. Once the cap is reached, the
   * oldest entries are discarded to make room. Set to 0 for
   * unlimited (not recommended in production).
   * @default 1000
   */
  maxBufferSize?: number;

  /**
   * PII redaction configuration. When enabled, string values in log entries
   * are scanned for common PII patterns (credit cards, emails, IPs, JWTs)
   * and replaced with `[REDACTED_*]` placeholders before output.
   */
  redact?: RedactConfig;
}

/**
 * Context passed to withRpcContext() for DO/WorkerEntrypoint RPC methods.
 * None of the fields are required — provide whatever is available at the
 * callsite. The logger will include any non-undefined values in every log
 * entry until the returned handle is disposed.
 */
export interface RpcContext {
  /**
   * Correlation ID from the calling Worker, propagated through the RPC
   * boundary explicitly since there is no Request object in RPC methods.
   */
  correlationId?: string;

  /** Name of the Durable Object or WorkerEntrypoint class. */
  agent?: string;

  /** Name of the specific RPC method being invoked. */
  operation?: string;

  /**
   * Unique identifier for the DO instance (e.g. ctx.id.toString() or
   * a logical name meaningful to the application).
   */
  instanceId?: string;

  /** Any additional fields to include in every log entry for this context. */
  extra?: Record<string, unknown>;
}

/**
 * A disposable handle returned by withRpcContext().
 * Implements Symbol.dispose so it can be used with the `using` keyword
 * (TC39 explicit resource management) for automatic cleanup on scope exit,
 * including early returns and thrown exceptions.
 *
 * @example
 * async generateSlides(prompt: string, correlationId: string) {
 *   using _ctx = logger.withRpcContext({ correlationId, agent: "SlideBuilder", operation: "generateSlides" });
 *   logger.info("generating slides"); // automatically cleaned up on exit
 * }
 */
export interface RpcContextHandle {
  [Symbol.dispose](): void;
}

/**
 * Structured error context for actionable error diagnostics.
 *
 * Inspired by evlog's structured errors — attach human-readable
 * guidance so operators can diagnose issues directly from logs.
 */
export interface StructuredErrorInfo {
  /** The underlying Error object. */
  error: Error;
  /** Why the error happened (root cause). */
  why?: string;
  /** How to fix or recover from the error. */
  fix?: string;
  /** Link to relevant docs, runbook, or dashboard. */
  link?: string;
}

/**
 * A structured log entry emitted by the Logger.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  [key: string]: unknown;
}
