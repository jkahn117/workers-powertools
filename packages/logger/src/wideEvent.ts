import type { Logger } from "./logger";
import type { LogLevel } from "./types";

/**
 * A wide event accumulates context over a unit of work (request, job,
 * workflow step) and emits a single comprehensive log entry when done.
 *
 * Instead of scattering many log calls throughout a handler, call
 * `set()` to accumulate fields, then `emit()` (or let middleware
 * auto-emit) to produce one information-dense log entry.
 *
 * @example
 * ```ts
 * const event = logger.createEvent("handling request");
 * event.set({ user: { id: 42, plan: "pro" } });
 * event.set({ cart: { items: 3, total: 9999 } });
 * event.set({ payment: { method: "card", status: "success" } });
 * event.emit(); // one log entry with all accumulated fields
 * ```
 */
export class WideEvent {
  private readonly logger: Logger;
  private readonly message: string;
  private readonly level: LogLevel;
  private readonly fields: Record<string, unknown> = {};
  private readonly startTime: number;
  private emitted = false;

  constructor(logger: Logger, message: string, level: LogLevel = "INFO") {
    this.logger = logger;
    this.message = message;
    this.level = level;
    this.startTime = Date.now();
  }

  /**
   * Accumulate fields onto the wide event. Fields are merged
   * shallowly — later calls override earlier keys at the top level.
   *
   * Nested objects are replaced, not deep-merged, so group related
   * fields under a namespace key and set them together.
   *
   * @example
   * event.set({ user: { id: 42, plan: "pro" } });
   * event.set({ payment: { method: "card" } });
   */
  set(fields: Record<string, unknown>): void {
    Object.assign(this.fields, fields);
  }

  /**
   * Emit the wide event as a single structured log entry.
   *
   * Automatically includes `duration_ms` (time since creation) and
   * all fields accumulated via `set()`. Inherits the parent logger's
   * context (correlation ID, CF properties, component, persistent keys).
   *
   * Can only be called once — subsequent calls are no-ops and log a
   * warning in dev mode.
   */
  emit(): void {
    if (this.emitted) {
      console.warn(
        "[WideEvent] emit() called more than once — ignoring duplicate emit.",
      );
      return;
    }
    this.emitted = true;

    const durationMs = Date.now() - this.startTime;

    // Delegate to the logger's level methods to respect log level,
    // buffering, and output routing.
    const extra: Record<string, unknown> = {
      ...this.fields,
      duration_ms: durationMs,
    };

    switch (this.level) {
      case "TRACE":
        this.logger.trace(this.message, extra);
        break;
      case "DEBUG":
        this.logger.debug(this.message, extra);
        break;
      case "INFO":
        this.logger.info(this.message, extra);
        break;
      case "WARN":
        this.logger.warn(this.message, extra);
        break;
      case "ERROR":
        this.logger.error(this.message, extra);
        break;
      case "CRITICAL":
        this.logger.critical(this.message, extra);
        break;
      default:
        console.warn(
          `[WideEvent] emit() called with unsupported level "${this.level}" — defaulting to INFO.`,
        );
        this.logger.info(this.message, extra);
    }
  }

  /** Whether this event has already been emitted. */
  get isEmitted(): boolean {
    return this.emitted;
  }
}
