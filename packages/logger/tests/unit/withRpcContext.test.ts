import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/logger";

describe("Logger / withRpcContext", () => {
  let logs: unknown[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logs.push(JSON.parse(msg));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enriches log entries with agent and operation fields", () => {
    const logger = new Logger({ serviceName: "api" });
    const handle = logger.withRpcContext({
      correlationId: "corr-123",
      agent: "SlideBuilder",
      operation: "generateSlides",
    });

    logger.info("generating");

    handle[Symbol.dispose]();

    expect(logs[0]).toMatchObject({
      correlation_id: "corr-123",
      agent: "SlideBuilder",
      operation: "generateSlides",
    });
  });

  it("clears rpc context after dispose", () => {
    const logger = new Logger({ serviceName: "api" });
    const handle = logger.withRpcContext({
      correlationId: "corr-123",
      agent: "SlideBuilder",
    });
    handle[Symbol.dispose]();

    logger.info("after dispose");

    expect(logs[0]).not.toHaveProperty("agent");
    expect(logs[0]).not.toHaveProperty("correlation_id");
  });

  it("works with `using` for automatic cleanup", () => {
    const logger = new Logger({ serviceName: "api" });

    // Simulate a function scope with using
    const runRpc = () => {
      using _ctx = logger.withRpcContext({
        agent: "SlideBuilder",
        operation: "generateSlides",
      });
      logger.info("inside rpc");
    };

    runRpc();
    logger.info("outside rpc");

    expect(logs[0]).toMatchObject({ agent: "SlideBuilder" });
    expect(logs[1]).not.toHaveProperty("agent");
  });

  it("sets correlation_id on shared state so children see it", () => {
    const logger = new Logger({ serviceName: "api" });
    const child = logger.withComponent("repository");

    const handle = logger.withRpcContext({ correlationId: "rpc-456" });
    child.info("child log");
    handle[Symbol.dispose]();

    expect(logs[0]).toMatchObject({
      component: "repository",
      correlation_id: "rpc-456",
    });
  });

  it("includes extra fields in log entries", () => {
    const logger = new Logger({ serviceName: "api" });
    const handle = logger.withRpcContext({
      extra: { connection_id: "conn_abc", tenant: "acme" },
    });

    logger.info("with extras");
    handle[Symbol.dispose]();

    expect(logs[0]).toMatchObject({
      connection_id: "conn_abc",
      tenant: "acme",
    });
  });

  it("works without correlationId — only enriches with provided fields", () => {
    const logger = new Logger({ serviceName: "api" });
    const handle = logger.withRpcContext({ agent: "Alarm", operation: "onAlarm" });

    logger.info("alarm fired");
    handle[Symbol.dispose]();

    expect(logs[0]).toMatchObject({ agent: "Alarm", operation: "onAlarm" });
    expect(logs[0]).not.toHaveProperty("correlation_id");
  });

  it.todo("instanceId appears as instance_id in log output");
  it.todo("does not clobber a pre-existing correlationId from addContext");
});
