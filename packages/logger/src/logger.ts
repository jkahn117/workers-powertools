import {
  PowertoolsBase,
  extractCorrelationId,
  extractCfProperties,
} from "@workers-powertools/commons";
import type {
  LoggerConfig,
  LogLevel,
  LogEntry,
  RpcContext,
  RpcContextHandle,
  StructuredErrorInfo,
} from "./types";
import { LOG_LEVEL_VALUE } from "./types";
import { WideEvent } from "./wideEvent";

/**
 * Shared mutable state between a parent Logger and any scoped children
 * created via withComponent(). Stored on the heap so all instances
 * read the same correlation ID, CF properties, and log level at emit
 * time — even if addContext() is called after withComponent().
 */
interface LoggerState {
  logLevel: LogLevel;
  correlationId?: string;
  cfProperties: Record<string, unknown>;
  contextEnriched: boolean;
  /** Whether this request was sampled-in for non-error logs. */
  sampled: boolean;
}

/**
 * Structured logger for Cloudflare Workers.
 *
 * Emits JSON-formatted log entries enriched with Workers context
 * (CF properties, correlation IDs, cold start detection).
 */
export class Logger extends PowertoolsBase {
  private readonly persistentKeys: Record<string, unknown>;
  private temporaryKeys: Record<string, unknown> = {};
  private readonly debugSampleRate: number;
  private readonly sampleRate: number;
  private readonly logBufferingEnabled: boolean;
  private readonly maxBufferSize: number;
  private readonly buffer: LogEntry[] = [];
  private readonly redactPatterns: Array<{ regex: RegExp; replacement: string }> | undefined;
  private readonly config: LoggerConfig;

  /**
   * Mutable request-level state. Shared with child loggers so that
   * addContext() on the parent is immediately visible in all scoped
   * children created via withComponent().
   */
  private readonly state: LoggerState;

  /**
   * Optional component name pre-tagged onto every log entry.
   * Set via withComponent() rather than directly.
   */
  private readonly component?: string;

  constructor(config?: LoggerConfig) {
    super(config);
    this.config = config ?? {};
    this.persistentKeys = { ...config?.persistentKeys };
    this.debugSampleRate = config?.debugSampleRate ?? 0;
    this.sampleRate = config?.sampleRate ?? 1;
    this.logBufferingEnabled = config?.logBufferingEnabled ?? false;
    this.maxBufferSize = config?.maxBufferSize ?? 1000;
    if (config?.redact?.enabled && config.redact.patterns.length > 0) {
      this.redactPatterns = config.redact.patterns;
    }
    this.state = {
      // logLevel resolved from constructor option only at construction time.
      // Call addContext(request, ctx, env) to apply POWERTOOLS_LOG_LEVEL at
      // runtime once the env binding is available.
      logLevel: config?.logLevel ?? "INFO",
      cfProperties: {},
      contextEnriched: false,
      sampled: true,
    };
  }

  /**
   * Returns a scoped child logger pre-tagged with a `component` field
   * on every log entry. The child shares the parent's request context
   * (correlation ID, CF properties, log level) so addContext() called
   * on the parent is reflected in all children.
   *
   * Calling withComponent() on a child appends to the existing component
   * path using " > " as a separator, up to a maximum depth of 5. This
   * preserves the full call chain in the log output.
   *
   * Component names should be static module or class names, not runtime
   * values — using dynamic strings (e.g. user IDs) will create unbounded
   * cardinality in any log aggregation system.
   *
   * @example
   * const repoLog = logger.withComponent("deckRepository");
   * repoLog.info("deck persisted", { deckId });
   * // { component: "deckRepository", message: "deck persisted", ... }
   *
   * const queryLog = repoLog.withComponent("query");
   * queryLog.info("executing SQL");
   * // { component: "deckRepository > query", message: "executing SQL", ... }
   */
  withComponent(component: string): Logger {
    const SEPARATOR = " > ";
    const MAX_DEPTH = 5;

    // Build the new component path by appending to the parent's path.
    const parentPath = this.component;
    const parentDepth = parentPath ? parentPath.split(SEPARATOR).length : 0;

    let childComponent: string;
    if (!parentPath) {
      childComponent = component;
    } else if (parentDepth >= MAX_DEPTH) {
      // Warn once and return this logger unchanged rather than silently
      // truncating, so the caller knows the depth limit has been hit.
      console.warn(
        `[Logger] withComponent("${component}") ignored: maximum component depth of ${String(MAX_DEPTH)} reached. Current path: "${parentPath}"`,
      );
      return this;
    } else {
      childComponent = `${parentPath}${SEPARATOR}${component}`;
    }

    const child = new Logger(this.config);

    // Point the child's state at the parent's state object so both
    // instances read and write the same mutable request context.
    (child as unknown as { state: LoggerState }).state = this.state;
    (child as unknown as { component?: string }).component = childComponent;

    // Child inherits the parent's persistent keys as a snapshot —
    // keys added to the parent after this call are not inherited,
    // which is the expected scoping behaviour.
    Object.assign(child.persistentKeys, this.persistentKeys);

    return child;
  }

  /**
   * Returns a new Logger instance with the provided keys merged into its
   * persistent keys, inheriting the parent's current persistent keys and
   * component path as a snapshot.
   *
   * Unlike appendTemporaryKeys(), this method is safe for concurrent use
   * in Durable Objects: each child has its own isolated key store and its
   * own state object (correlationId, logLevel, CF properties), so
   * concurrent RPC calls cannot mutate each other's context.
   *
   * Use this as the primary way to scope a logger for a single RPC
   * invocation or sub-operation, rather than mutating the shared parent.
   *
   * @example
   * // In a DO RPC method — each concurrent call gets its own isolated logger
   * async generateSlides(prompt: string, correlationId: string) {
   *   const log = logger.child({
   *     correlation_id: correlationId,
   *     operation: "generateSlides",
   *   });
   *   log.info("generating slides", { prompt });
   *   // Concurrent calls cannot clobber each other's correlation_id
   * }
   *
   * @example
   * // With component scoping — child() and withComponent() compose naturally
   * const log = logger
   *   .withComponent("deckService")
   *   .child({ requestId: "abc", userId: "u-123" });
   */
  child(extraKeys: Record<string, unknown>): Logger {
    const childLogger = new Logger(this.config);

    // The child gets its own independent state — not a reference to the
    // parent's. This is the critical difference from withComponent().
    // Each concurrent RPC call can set its own correlationId without
    // affecting siblings.
    (childLogger as unknown as { state: LoggerState }).state = {
      logLevel: this.state.logLevel,
      correlationId: this.state.correlationId,
      cfProperties: { ...this.state.cfProperties },
      contextEnriched: this.state.contextEnriched,
      sampled: this.state.sampled,
    };

    // Inherit the parent's component path.
    (childLogger as unknown as { component?: string }).component = this.component;

    // Merge: parent persistent keys (snapshot) + extra keys passed by caller.
    // Extra keys take precedence, allowing callers to override inherited values.
    Object.assign(childLogger.persistentKeys, this.persistentKeys, extraKeys);

    return childLogger;
  }

  /**
   * Enrich the logger with context from the current request.
   * Should be called once per request at the start of the handler.
   * Context is automatically shared with all children created via
   * withComponent().
   *
   * Pass the Workers `env` object as the third argument to apply
   * runtime configuration from environment variables:
   *   - POWERTOOLS_LOG_LEVEL  — overrides the constructor logLevel
   *   - POWERTOOLS_SERVICE_NAME — overrides the constructor serviceName
   *
   * @example
   * export default {
   *   async fetch(request, env, ctx) {
   *     logger.addContext(request, ctx, env);
   *   }
   * }
   */
  addContext(
    request: Request,
    _ctx?: ExecutionContext,
    env?: Record<string, unknown>,
  ): void {
    // Apply runtime env-var config when env is provided.
    // Constructor option takes precedence; env vars are the fallback.
    if (env && !this.config.logLevel) {
      const envLevel = env["POWERTOOLS_LOG_LEVEL"];
      if (typeof envLevel === "string" && envLevel in LOG_LEVEL_VALUE) {
        this.state.logLevel = envLevel as LogLevel;
      }
    }

    if (env && !this.config.serviceName) {
      const envService = env["POWERTOOLS_SERVICE_NAME"];
      if (typeof envService === "string" && envService) {
        (this as unknown as { serviceName: string }).serviceName = envService;
      }
    }

    this.state.correlationId = extractCorrelationId(
      request,
      this.config.correlationIdConfig,
    );
    this.state.cfProperties = extractCfProperties(request);
    this.state.contextEnriched = true;

    // Apply debug sampling: randomly elevate log level for a
    // percentage of requests to capture detailed diagnostics.
    if (this.debugSampleRate > 0 && Math.random() < this.debugSampleRate) {
      this.state.logLevel = "DEBUG";
    }

    // Two-tier sampling: decide whether non-error logs are emitted for
    // this request. Errors/criticals always emit regardless.
    this.state.sampled = this.sampleRate >= 1 || Math.random() < this.sampleRate;
  }

  /** Get the correlation ID extracted or generated by `addContext()`. */
  getCorrelationId(): string | undefined {
    return this.state.correlationId;
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

  /**
   * Reset all per-request state on a reused module-scope logger.
   *
   * Call this at the start of each request in vanilla Workers (without
   * framework middleware) to prevent correlation IDs, CF properties,
   * and temporary keys from leaking between requests.
   *
   * Framework middleware (`injectLogger`) handles this automatically.
   *
   * @example
   * export default {
   *   async fetch(request, env, ctx) {
   *     logger.resetContext();
   *     logger.addContext(request, ctx, env);
   *     // ...
   *   }
   * }
   */
  resetContext(): void {
    this.state.correlationId = undefined;
    this.state.cfProperties = {};
    this.state.contextEnriched = false;
    this.state.sampled = true;
    this.temporaryKeys = {};
    this.buffer.length = 0;
  }

  /**
   * Enriches the logger with context for a Durable Object or WorkerEntrypoint
   * RPC method invocation, where no Request object is available.
   *
   * Returns a disposable handle that clears the RPC context when disposed.
   * Use with the `using` keyword for automatic cleanup on scope exit —
   * including early returns and thrown exceptions — so the finally cleanup
   * is never forgotten.
   *
   * @example
   * // Plain Durable Object — correlationId passed explicitly via RPC args
   * async generateSlides(prompt: string, correlationId: string) {
   *   using _ctx = logger.withRpcContext({
   *     correlationId,
   *     agent: "SlideBuilder",
   *     operation: "generateSlides",
   *   });
   *   logger.info("generating slides", { prompt });
   * }
   *
   * @example
   * // WorkerEntrypoint — same pattern
   * async processItem(item: Item, correlationId: string) {
   *   using _ctx = logger.withRpcContext({
   *     correlationId,
   *     agent: "ItemProcessor",
   *     operation: "processItem",
   *   });
   *   logger.info("processing item", { itemId: item.id });
   * }
   */
  withRpcContext(context: RpcContext): RpcContextHandle {
    const keys: Record<string, unknown> = {};

    if (context.correlationId) {
      // Set on shared state so all children (withComponent etc.) see it too.
      this.state.correlationId = context.correlationId;
    }
    if (context.agent) {
      keys["agent"] = context.agent;
    }
    if (context.operation) {
      keys["operation"] = context.operation;
    }
    if (context.instanceId) {
      keys["instance_id"] = context.instanceId;
    }
    if (context.extra) {
      Object.assign(keys, context.extra);
    }

    this.appendTemporaryKeys(keys);

    return {
      [Symbol.dispose]: () => {
        this.clearTemporaryKeys();
        // Clear the correlation ID set for this RPC invocation.
        if (context.correlationId) {
          this.state.correlationId = undefined;
        }
      },
    };
  }

  /**
   * Create a wide event that accumulates context over a unit of work
   * and emits a single comprehensive log entry when done.
   *
   * Use this instead of multiple `logger.info()` calls to produce one
   * information-dense log entry per request, job, or workflow step.
   *
   * The event inherits this logger's context (correlation ID, CF properties,
   * component, persistent/temporary keys) at emit time.
   *
   * @param message - Summary message for the wide event log entry.
   * @param level - Log level for the emitted entry. Defaults to "INFO".
   *
   * @example
   * const event = logger.createEvent("request handled");
   * event.set({ user: { id: 42, plan: "pro" } });
   * event.set({ cart: { items: 3, total: 9999 } });
   * event.emit(); // one log entry with all fields + duration_ms
   */
  createEvent(message: string, level?: LogLevel): WideEvent {
    return new WideEvent(this, message, level);
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

  error(message: string, errorOrExtra?: Error | StructuredErrorInfo | Record<string, unknown>): void {
    let extra: Record<string, unknown> | undefined;
    const e = errorOrExtra;

    if (e instanceof Error) {
      extra = { error_name: e.name, error_message: e.message, stack_trace: e.stack };
    } else if (e && typeof e === "object" && "error" in e && e.error instanceof Error) {
      const i = e as StructuredErrorInfo;
      extra = { error_name: i.error.name, error_message: i.error.message, stack_trace: i.error.stack };
      if (i.why) extra.why = i.why;
      if (i.fix) extra.fix = i.fix;
      if (i.link) extra.link = i.link;
    } else {
      extra = e as Record<string, unknown> | undefined;
    }

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
      // component is inserted after persistentKeys so it cannot be
      // accidentally overwritten by caller-supplied persistent state.
      ...(this.component ? { component: this.component } : {}),
      ...(this.state.correlationId ? { correlation_id: this.state.correlationId } : {}),
      ...(this.state.contextEnriched ? this.state.cfProperties : {}),
      ...extra,
    };

    if (LOG_LEVEL_VALUE[level] < LOG_LEVEL_VALUE[this.state.logLevel]) {
      // Below threshold: buffer if enabled, otherwise discard.
      if (this.logBufferingEnabled) {
        if (this.maxBufferSize > 0 && this.buffer.length >= this.maxBufferSize) {
          this.buffer.shift();
        }
        this.buffer.push(entry);
      }
      return;
    }

    // Two-tier sampling: non-error logs are dropped for unsampled requests.
    // Errors and criticals always emit.
    if (!this.state.sampled && LOG_LEVEL_VALUE[level] < LOG_LEVEL_VALUE["ERROR"]) {
      return;
    }

    this.writeLog(entry);
  }

  /** Write a structured log entry to the appropriate console method. */
  private writeLog(entry: LogEntry): void {
    if (this.redactPatterns) {
      this.redact(entry as unknown as Record<string, unknown>);
    }
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

  private redact(o: Record<string, unknown>): void {
    const p = this.redactPatterns!;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "string") {
        let r = v;
        for (const x of p) { x.regex.lastIndex = 0; r = r.replace(x.regex, x.replacement); }
        o[k] = r;
      } else if (v && typeof v === "object") {
        if (Array.isArray(v)) { for (const el of v) { if (el && typeof el === "object") this.redact(el as Record<string, unknown>); } }
        else this.redact(v as Record<string, unknown>);
      }
    }
  }
}
