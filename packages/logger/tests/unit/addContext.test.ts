import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/logger";

describe("Logger / addContext", () => {
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

  it("extracts correlation_id from x-request-id header", () => {
    const logger = new Logger();
    const request = new Request("https://example.com", {
      headers: { "x-request-id": "req-abc" },
    });

    logger.addContext(request);
    logger.info("test");

    expect(logs[0]).toMatchObject({ correlation_id: "req-abc" });
  });

  it("generates a correlation_id when no header is present", () => {
    const logger = new Logger();
    logger.addContext(new Request("https://example.com"));
    logger.info("test");

    expect((logs[0] as Record<string, unknown>)["correlation_id"]).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("includes a timestamp in ISO 8601 format", () => {
    const logger = new Logger();
    logger.info("test");

    expect(typeof (logs[0] as Record<string, unknown>)["timestamp"]).toBe("string");
    expect(() =>
      new Date((logs[0] as Record<string, unknown>)["timestamp"] as string).toISOString(),
    ).not.toThrow();
  });

  it.todo("extracts cf-ray header and adds it to log context");
  it.todo("extracts colo and country from the cf object");
});
