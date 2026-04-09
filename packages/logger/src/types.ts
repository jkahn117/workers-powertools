import type { PowertoolsConfig, CorrelationIdConfig } from "@workers-powertools/commons";

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
   * When true, buffer logs below the configured level and flush
   * them all if an error occurs during the request. Flushed via
   * ctx.waitUntil to avoid blocking the response.
   * @default false
   */
  logBufferingEnabled?: boolean;
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
 * A structured log entry emitted by the Logger.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  [key: string]: unknown;
}
