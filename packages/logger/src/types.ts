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
 * A structured log entry emitted by the Logger.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  [key: string]: unknown;
}
