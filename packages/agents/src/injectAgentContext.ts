import { getCurrentAgent } from "agents";
import type { Logger, RpcContextHandle } from "@workers-powertools/logger";
import type { Tracer } from "@workers-powertools/tracer";

/**
 * Options for injectAgentContext().
 *
 * All fields are optional. When called from within an Agent RPC method,
 * agent name and connection ID are resolved automatically from
 * getCurrentAgent(). Explicit options take precedence over auto-resolved
 * values, allowing callers to override or supplement what the SDK provides.
 */
export interface AgentContextOptions {
  /**
   * Logger instance to enrich. When provided, agent name, operation,
   * connection ID, and correlation ID are appended as temporary keys
   * for the duration of the RPC call.
   */
  logger?: Logger;

  /**
   * Tracer instance to enrich. When provided, the correlation ID is set
   * on the tracer so outbound fetch calls made during the RPC method carry
   * the same correlation ID as the log entries.
   */
  tracer?: Tracer;

  /**
   * Name of the RPC method or operation being invoked. Used to annotate
   * log entries with the specific operation for filtering.
   * @example "generateSlides", "processQueue", "onAlarm"
   */
  operation?: string;

  /**
   * Correlation ID propagated explicitly from the calling Worker via an
   * RPC argument. Takes precedence over any ID extracted from the
   * connection context.
   *
   * Convention: add `correlationId?: string` as the last parameter of
   * every public RPC method and pass it through from the Worker's own
   * correlation ID.
   */
  correlationId?: string;

  /**
   * Any additional fields to include in every log entry for the duration
   * of this RPC invocation.
   */
  extra?: Record<string, unknown>;
}

/**
 * A disposable handle returned by injectAgentContext().
 * Implements Symbol.dispose for use with the `using` keyword.
 */
export interface AgentContextHandle extends RpcContextHandle {
  /** The resolved correlation ID (from explicit option or connection context). */
  readonly correlationId: string | undefined;
}

/**
 * Enriches the logger and/or tracer with Agents SDK context for the
 * duration of an Agent RPC method or lifecycle method.
 *
 * Automatically extracts agent name and connection ID from
 * getCurrentAgent() without requiring `this` or request injection.
 * Degrades gracefully when called outside an agent context (e.g. in
 * tests), so instrumentation code does not need to be conditionally
 * removed for testing.
 *
 * Use with the `using` keyword for automatic cleanup on scope exit,
 * including early returns and thrown exceptions.
 *
 * @example
 * // Inside an Agent RPC method — correlationId passed explicitly
 * async generateSlides(prompt: string, correlationId?: string) {
 *   using _ctx = injectAgentContext({
 *     logger,
 *     tracer,
 *     operation: "generateSlides",
 *     correlationId,
 *   });
 *   logger.info("generating slides", { prompt });
 *   // emits: { agent: "SlideBuilder", operation: "generateSlides",
 *   //          connection_id: "conn_abc", correlation_id: "req-123", ... }
 * }
 *
 * @example
 * // Scheduled alarm — no connection, no correlationId
 * async onAlarm() {
 *   using _ctx = injectAgentContext({ logger, operation: "onAlarm" });
 *   logger.info("alarm fired");
 *   // emits: { agent: "SlideBuilder", operation: "onAlarm", ... }
 * }
 */
export function injectAgentContext(options: AgentContextOptions): AgentContextHandle {
  const {
    logger,
    tracer,
    operation,
    correlationId: explicitCorrelationId,
    extra,
  } = options;

  // Resolve agent context from the Agents SDK. Returns undefined values
  // gracefully when called outside an agent context.
  const { agent, connection } = getCurrentAgent();

  const agentName = agent?.name;

  // Prefer explicit correlationId (caller-propagated), fall back to
  // connection ID so logs and traces are at least correlated within the
  // same WebSocket session even without explicit propagation.
  const resolvedCorrelationId = explicitCorrelationId ?? connection?.id;

  // Enrich the logger with all available context as temporary keys.
  // Temporary keys are cleared when the handle is disposed, ensuring
  // context from one RPC call does not leak into subsequent calls on the
  // same reused logger instance.
  let loggerHandle: RpcContextHandle | undefined;
  if (logger) {
    loggerHandle = logger.withRpcContext({
      correlationId: resolvedCorrelationId,
      agent: agentName,
      operation,
      extra: {
        ...(connection?.id ? { connection_id: connection.id } : {}),
        ...extra,
      },
    });
  }

  // Enrich the tracer so outbound fetch calls carry the same correlation ID.
  if (tracer && resolvedCorrelationId) {
    tracer.setCorrelationId(resolvedCorrelationId);
  }

  return {
    correlationId: resolvedCorrelationId,
    [Symbol.dispose]() {
      loggerHandle?.[Symbol.dispose]();
    },
  };
}
