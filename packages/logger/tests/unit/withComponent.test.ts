import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/logger";

describe("Logger / withComponent", () => {
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

  it("includes component field on every child log entry", () => {
    const logger = new Logger({ serviceName: "api" });
    const child = logger.withComponent("deckRepository");

    child.info("deck persisted", { deckId: "abc" });

    expect(logs[0]).toMatchObject({
      component: "deckRepository",
      message: "deck persisted",
      deckId: "abc",
    });
  });

  it("parent logs do not include component field", () => {
    const logger = new Logger({ serviceName: "api" });
    const _child = logger.withComponent("deckRepository");

    logger.info("parent log");

    expect(logs[0]).not.toHaveProperty("component");
  });

  it("child reflects addContext called on parent after withComponent", () => {
    const logger = new Logger({ serviceName: "api" });
    const child = logger.withComponent("deckRepository");

    // addContext called AFTER withComponent — child must still see it
    logger.addContext(
      new Request("https://example.com", {
        headers: { "x-request-id": "req-xyz" },
      }),
    );

    child.info("deck fetched");

    expect(logs[0]).toMatchObject({
      component: "deckRepository",
      correlation_id: "req-xyz",
    });
  });

  it("child inherits parent persistent keys set before withComponent", () => {
    const logger = new Logger({
      serviceName: "api",
      persistentKeys: { environment: "production" },
    });
    const child = logger.withComponent("deckRepository");

    child.info("test");

    expect(logs[0]).toMatchObject({
      environment: "production",
      component: "deckRepository",
    });
  });

  it("child persistent keys do not bleed back to parent", () => {
    const logger = new Logger({ serviceName: "api" });
    const child = logger.withComponent("deckRepository");
    child.appendPersistentKeys({ childOnly: true });

    logger.info("parent log");

    expect(logs[0]).not.toHaveProperty("childOnly");
  });

  it("multiple siblings have independent component names", () => {
    const logger = new Logger({ serviceName: "api" });
    const repoLog = logger.withComponent("deckRepository");
    const svcLog = logger.withComponent("deckService");

    repoLog.info("from repo");
    svcLog.info("from service");

    expect(logs[0]).toMatchObject({ component: "deckRepository" });
    expect(logs[1]).toMatchObject({ component: "deckService" });
  });

  it("component field survives debug level elevation via parent addContext", () => {
    // Force sampling to always elevate
    vi.spyOn(Math, "random").mockReturnValue(0);
    const debugLogs: string[] = [];
    vi.spyOn(console, "debug").mockImplementation((msg: string) => debugLogs.push(msg));

    const logger = new Logger({ serviceName: "api", debugSampleRate: 1 });
    const child = logger.withComponent("repo");
    logger.addContext(new Request("https://example.com"));

    child.debug("debug from child");

    const entry = JSON.parse(debugLogs[0] ?? "{}");
    expect(entry).toMatchObject({ component: "repo" });
  });

  it("withComponent on a child appends with ' > ' separator", () => {
    const logger = new Logger({ serviceName: "api" });
    const child = logger.withComponent("deckService");
    const grandchild = child.withComponent("deckRepository");

    grandchild.info("executing query");

    expect(logs[0]).toMatchObject({
      component: "deckService > deckRepository",
    });
  });

  it("three levels deep produces the full path", () => {
    const logger = new Logger({ serviceName: "api" });
    const a = logger.withComponent("service");
    const b = a.withComponent("repository");
    const c = b.withComponent("query");

    c.info("deep log");

    expect(logs[0]).toMatchObject({
      component: "service > repository > query",
    });
  });

  it("returns the same logger and warns at depth 5", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = new Logger({ serviceName: "api" });

    const d1 = logger.withComponent("a");
    const d2 = d1.withComponent("b");
    const d3 = d2.withComponent("c");
    const d4 = d3.withComponent("d");
    const d5 = d4.withComponent("e"); // depth 5 — at limit

    // This call should be blocked and return d5 unchanged
    const d6 = d5.withComponent("f");

    d6.info("at limit");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("maximum component depth of 5 reached"),
    );
    expect(logs[0]).toMatchObject({ component: "a > b > c > d > e" });
  });

  it.todo("component field position: appears after service, before correlation_id");
});
