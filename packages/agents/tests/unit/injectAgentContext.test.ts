import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "@workers-powertools/logger";
import { Tracer } from "@workers-powertools/tracer";
import { injectAgentContext } from "../../src/injectAgentContext";

// Mock getCurrentAgent from the agents SDK. In real agent invocations the
// SDK populates this automatically. In unit tests we control it directly.
vi.mock("agents", () => ({
  getCurrentAgent: vi.fn(() => ({
    agent: undefined,
    connection: undefined,
    request: undefined,
    email: undefined,
  })),
}));

const { getCurrentAgent } = await import("agents");

describe("injectAgentContext", () => {
  let logs: unknown[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logs.push(JSON.parse(msg));
    });
    vi.mocked(getCurrentAgent).mockReturnValue({
      agent: undefined,
      connection: undefined,
      request: undefined,
      email: undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enriches logger with agent name from getCurrentAgent()", () => {
    vi.mocked(getCurrentAgent).mockReturnValue({
      agent: { name: "SlideBuilder" } as never,
      connection: undefined,
      request: undefined,
      email: undefined,
    });

    const logger = new Logger({ serviceName: "api" });
    const handle = injectAgentContext({ logger, operation: "generateSlides" });

    logger.info("generating");
    handle[Symbol.dispose]();

    expect(logs[0]).toMatchObject({
      agent: "SlideBuilder",
      operation: "generateSlides",
    });
  });

  it("prefers explicit correlationId over connection.id", () => {
    vi.mocked(getCurrentAgent).mockReturnValue({
      agent: { name: "SlideBuilder" } as never,
      connection: { id: "conn_abc" } as never,
      request: undefined,
      email: undefined,
    });

    const logger = new Logger({ serviceName: "api" });
    const handle = injectAgentContext({
      logger,
      correlationId: "explicit-corr-123",
    });

    logger.info("with explicit correlation");
    handle[Symbol.dispose]();

    expect(logs[0]).toMatchObject({ correlation_id: "explicit-corr-123" });
  });

  it("falls back to connection.id when no explicit correlationId", () => {
    vi.mocked(getCurrentAgent).mockReturnValue({
      agent: { name: "SlideBuilder" } as never,
      connection: { id: "conn_abc" } as never,
      request: undefined,
      email: undefined,
    });

    const logger = new Logger({ serviceName: "api" });
    const handle = injectAgentContext({ logger });

    logger.info("with connection fallback");
    handle[Symbol.dispose]();

    expect(logs[0]).toMatchObject({ correlation_id: "conn_abc" });
  });

  it("includes connection_id as a separate field alongside correlation_id", () => {
    vi.mocked(getCurrentAgent).mockReturnValue({
      agent: { name: "SlideBuilder" } as never,
      connection: { id: "conn_abc" } as never,
      request: undefined,
      email: undefined,
    });

    const logger = new Logger({ serviceName: "api" });
    const handle = injectAgentContext({
      logger,
      correlationId: "explicit-123",
    });

    logger.info("both ids");
    handle[Symbol.dispose]();

    expect(logs[0]).toMatchObject({
      correlation_id: "explicit-123",
      connection_id: "conn_abc",
    });
  });

  it("degrades gracefully outside an agent context", () => {
    // getCurrentAgent returns all-undefined — simulates test environment
    const logger = new Logger({ serviceName: "api" });
    const handle = injectAgentContext({ logger, operation: "onAlarm" });

    logger.info("outside agent");
    handle[Symbol.dispose]();

    expect(logs[0]).toMatchObject({ operation: "onAlarm" });
    expect(logs[0]).not.toHaveProperty("agent");
    expect(logs[0]).not.toHaveProperty("correlation_id");
  });

  it("sets correlationId on tracer when provided", () => {
    vi.mocked(getCurrentAgent).mockReturnValue({
      agent: { name: "SlideBuilder" } as never,
      connection: { id: "conn_abc" } as never,
      request: undefined,
      email: undefined,
    });

    const tracer = new Tracer({ serviceName: "api" });
    const handle = injectAgentContext({ tracer, correlationId: "corr-xyz" });
    handle[Symbol.dispose]();

    expect(tracer.getCorrelationId()).toBe("corr-xyz");
  });

  it("cleans up logger context after dispose", () => {
    const logger = new Logger({ serviceName: "api" });
    const handle = injectAgentContext({ logger, operation: "doWork" });
    handle[Symbol.dispose]();

    logger.info("after dispose");

    expect(logs[0]).not.toHaveProperty("operation");
  });

  it("exposes resolved correlationId on the handle", () => {
    vi.mocked(getCurrentAgent).mockReturnValue({
      agent: undefined,
      connection: { id: "conn_abc" } as never,
      request: undefined,
      email: undefined,
    });

    const handle = injectAgentContext({ correlationId: "explicit" });
    expect(handle.correlationId).toBe("explicit");
    handle[Symbol.dispose]();
  });

  it.todo("works with `using` for automatic cleanup");
  it.todo("enriches metrics binding key if metrics instance provided");
});
