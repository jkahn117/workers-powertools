import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/logger";
import { WideEvent } from "../../src/wideEvent";

describe("WideEvent", () => {
  let logger: Logger;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new Logger({ serviceName: "test-service" });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a wide event via logger.createEvent()", () => {
    const event = logger.createEvent("request handled");
    expect(event).toBeInstanceOf(WideEvent);
    expect(event.isEmitted).toBe(false);
  });

  it("accumulates fields with set()", () => {
    const event = logger.createEvent("request handled");
    event.set({ user: { id: 42, plan: "pro" } });
    event.set({ cart: { items: 3, total: 9999 } });
    event.emit();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.message).toBe("request handled");
    expect(output.user).toEqual({ id: 42, plan: "pro" });
    expect(output.cart).toEqual({ items: 3, total: 9999 });
  });

  it("later set() calls override earlier keys at top level", () => {
    const event = logger.createEvent("test");
    event.set({ count: 1 });
    event.set({ count: 2 });
    event.emit();

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.count).toBe(2);
  });

  it("includes duration_ms", () => {
    const event = logger.createEvent("test");
    event.emit();

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(typeof output.duration_ms).toBe("number");
    expect(output.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("includes logger context (service name)", () => {
    const event = logger.createEvent("test");
    event.emit();

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.service).toBe("test-service");
  });

  it("defaults to INFO level", () => {
    const event = logger.createEvent("test");
    event.emit();

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("INFO");
  });

  it("respects custom log level", () => {
    const event = logger.createEvent("test", "WARN");
    event.emit();

    const warnSpy = vi.mocked(console.warn);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(output.level).toBe("WARN");
  });

  it("marks isEmitted after emit()", () => {
    const event = logger.createEvent("test");
    expect(event.isEmitted).toBe(false);
    event.emit();
    expect(event.isEmitted).toBe(true);
  });

  it("ignores duplicate emit() calls", () => {
    const event = logger.createEvent("test");
    const warnSpy = vi.mocked(console.warn);

    event.emit();
    event.emit(); // second call should be a no-op with a warning

    // One real log from first emit, one console.warn from the second
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[WideEvent] emit() called more than once — ignoring duplicate emit.",
    );
  });

  it("works with child loggers", () => {
    const child = logger.child({ extra_key: "from-child" });
    const event = child.createEvent("child event");
    event.set({ action: "test" });
    event.emit();

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.message).toBe("child event");
    expect(output.action).toBe("test");
    expect(output.extra_key).toBe("from-child");
  });

  it("works with withComponent loggers", () => {
    const componentLogger = logger.withComponent("api");
    const event = componentLogger.createEvent("component event");
    event.emit();

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.component).toBe("api");
  });
});
