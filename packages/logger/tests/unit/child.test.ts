import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/logger";

describe("Logger / child()", () => {
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

  it("includes extra keys in every child log entry", () => {
    const logger = new Logger({ serviceName: "api" });
    const child = logger.child({
      correlation_id: "req-123",
      operation: "generateSlides",
    });

    child.info("slide started");

    expect(logs[0]).toMatchObject({
      correlation_id: "req-123",
      operation: "generateSlides",
    });
  });

  it("inherits parent persistent keys as a snapshot", () => {
    const logger = new Logger({
      serviceName: "api",
      persistentKeys: { environment: "prod" },
    });
    const child = logger.child({ operation: "doWork" });

    child.info("working");

    expect(logs[0]).toMatchObject({ environment: "prod", operation: "doWork" });
  });

  it("extra keys take precedence over inherited persistent keys", () => {
    const logger = new Logger({
      serviceName: "api",
      persistentKeys: { environment: "prod" },
    });
    const child = logger.child({ environment: "staging" });

    child.info("overridden");

    expect(logs[0]).toMatchObject({ environment: "staging" });
  });

  it("mutations on the child do not affect the parent", () => {
    const logger = new Logger({ serviceName: "api" });
    const child = logger.child({ operation: "rpc" });
    child.appendPersistentKeys({ childOnly: true });

    logger.info("parent");

    expect(logs[0]).not.toHaveProperty("childOnly");
  });

  it("mutations on the parent after child() do not affect the child", () => {
    const logger = new Logger({ serviceName: "api" });
    const child = logger.child({ operation: "rpc" });
    logger.appendPersistentKeys({ addedAfter: true });

    child.info("child");

    expect(logs[0]).not.toHaveProperty("addedAfter");
  });

  it("concurrent children have fully isolated state", () => {
    const logger = new Logger({ serviceName: "api" });

    // Simulate two concurrent RPC calls each creating their own child
    const childA = logger.child({ correlation_id: "corr-A", operation: "opA" });
    const childB = logger.child({ correlation_id: "corr-B", operation: "opB" });

    childA.info("from A");
    childB.info("from B");

    expect(logs[0]).toMatchObject({ correlation_id: "corr-A", operation: "opA" });
    expect(logs[1]).toMatchObject({ correlation_id: "corr-B", operation: "opB" });
  });

  it("clearTemporaryKeys on the child does not affect the parent", () => {
    const logger = new Logger({ serviceName: "api" });
    logger.appendTemporaryKeys({ shared: true });

    const child = logger.child({ operation: "rpc" });
    child.clearTemporaryKeys();

    logger.info("parent after child clear");

    expect(logs[0]).toMatchObject({ shared: true });
  });

  it("inherits parent component path", () => {
    const logger = new Logger({ serviceName: "api" });
    const scoped = logger.withComponent("deckService");
    const child = scoped.child({ correlation_id: "corr-123" });

    child.info("in component child");

    expect(logs[0]).toMatchObject({
      component: "deckService",
      correlation_id: "corr-123",
    });
  });

  it("child inherits parent log level", () => {
    const debugLogs: string[] = [];
    vi.spyOn(console, "debug").mockImplementation((msg: string) => debugLogs.push(msg));

    const logger = new Logger({ serviceName: "api", logLevel: "DEBUG" });
    const child = logger.child({ operation: "rpc" });

    child.debug("debug from child");

    expect(debugLogs).toHaveLength(1);
  });

  it.todo(
    "child() and withRpcContext() compose: child provides isolation, withRpcContext sets correlationId on shared state",
  );
  it.todo("child inherits CF properties snapshot from parent after addContext()");
});
