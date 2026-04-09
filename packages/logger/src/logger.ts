import {
  PowertoolsBase,
  extractCorrelationId,
  extractCfProperties,
} from "@workers-powertools/commons";
import type { LoggerConfig, LogLevel, LogEntry } from "./types";
import { LOG_LEVEL_VALUE } from "./types";

/**
 * Structured logger for Cloudflare Workers.
 *
 * Emits JSON-formatted log entries enriched with Workers context
 * (CF properties, correlation IDs, cold start detection).
 */
export class Logger extends PowertoolsBase {
  private logLevel: LogLevel;
  private readonly persistentKeys: Record<string, unknown>;
  private temporaryKeys: Record<string, unknown> = {};
  private correlationId?: string;
  private readonly debugSampleRate: number;
  private readonly logBufferingEnabled: boolean;
  private readonly buffer: LogEntry[] = [];
  private contextEnriched = false;
  private cfProperties: Record<string, unknown> = {};
  private readonly config: LoggerConfig;

  constructor(config?: LoggerConfig) {
    super(config);
    this.config = config ?? {};
    this.logLevel = config?.logLevel ?? "INFO";
    this.persistentKeys = { ...config?.persistentKeys };
    this.debugSampleRate = config?.debugSampleRate ?? 0;
    this.logBufferingEnabled = config?.logBufferingEnabled ?? false;
  }

  /**
   * Enrich the logger with context from the current request.
   * Should be called once per request at the start of the handler.
   */
  addContext(request: Request, _ctx?: ExecutionContext): void {
    this.correlationId = extractCorrelationId(request, this.config.correlationIdConfig);
    this.cfProperties = extractCfProperties(request);
    this.contextEnriched = true;

    // Apply debug sampling: randomly elevate log level for a
    // percentage of requests to capture detailed diagnostics.
    if (this.debugSampleRate > 0 && Math.random() < this.debugSampleRate) {
      this.logLevel = "DEBUG";
    }
  }

  /** Append key-value pairs that persist for the lifetime of this logger instance. */
  appendPersistentKeys(keys: Record<string, unknown>): void {
    Object.assign(this.persistentKeys, keys);
  }

  /** Append key-value pairs that are cleared between requests. */
  appendTemporaryKeys(keys: Record<string, unknown>): void {
    Object.assign(this.temporaryKeys, keys);
  }

  /** Clear temporary keys (call between requests if reusing the logger). */
  clearTemporaryKeys(): void {
    this.temporaryKeys = {};
  }

  trace(message: string, extra?: Record<string, unknown>): void {
    this.emit("TRACE", message, extra);
  }

  debug(message: string, extra?: Record<string, unknown>): void {
    this.emit("DEBUG", message, extra);
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.emit("INFO", message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.emit("WARN", message, extra);
  }

  error(message: string, errorOrExtra?: Error | Record<string, unknown>): void {
    const extra =
      errorOrExtra instanceof Error
        ? {
            error_name: errorOrExtra.name,
            error_message: errorOrExtra.message,
            stack_trace: errorOrExtra.stack,
          }
        : errorOrExtra;

    this.emit("ERROR", message, extra);

    // Flush buffered logs on error so we have full context for debugging.
    if (this.logBufferingEnabled && this.buffer.length > 0) {
      this.flushBuffer();
    }
  }

  critical(message: string, extra?: Record<string, unknown>): void {
    this.emit("CRITICAL", message, extra);

    if (this.logBufferingEnabled && this.buffer.length > 0) {
      this.flushBuffer();
    }
  }

  /**
   * Core emit method. Builds the structured log entry, checks
   * the log level, and writes to console or buffer.
   */
  private emit(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      ...this.persistentKeys,
      ...this.temporaryKeys,
      ...(this.correlationId ? { correlation_id: this.correlationId } : {}),
      ...(this.contextEnriched ? this.cfProperties : {}),
      ...extra,
    };

    if (LOG_LEVEL_VALUE[level] < LOG_LEVEL_VALUE[this.logLevel]) {
      // Below threshold: buffer if enabled, otherwise discard.
      if (this.logBufferingEnabled) {
        this.buffer.push(entry);
      }
      return;
    }

    this.writeLog(entry);
  }

  /** Write a structured log entry to the appropriate console method. */
  private writeLog(entry: LogEntry): void {
    const output = JSON.stringify(entry);

    switch (entry.level) {
      case "TRACE":
      case "DEBUG":
        console.debug(output);
        break;
      case "INFO":
        console.log(output);
        break;
      case "WARN":
        console.warn(output);
        break;
      case "ERROR":
      case "CRITICAL":
        console.error(output);
        break;
    }
  }

  /** Flush all buffered log entries (called on error/critical). */
  private flushBuffer(): void {
    for (const entry of this.buffer) {
      this.writeLog(entry);
    }
    this.buffer.length = 0;
  }
}
