import { describe, it, expect, vi } from "vitest";
import { Logger } from "../../src/logger";

describe("Logger / initialization", () => {
  it("uses provided serviceName", () => {
    const logger = new Logger({ serviceName: "my-api" });
    // serviceName surfaces in log output — verify via emitted JSON
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg) => logs.push(msg));

    logger.info("test");

    const entry = JSON.parse(logs[0] ?? "{}");
    expect(entry.service).toBe("my-api");
  });

  it("defaults log level to INFO", () => {
    const logger = new Logger();
    const debugLogs: string[] = [];
    vi.spyOn(console, "debug").mockImplementation((msg) => debugLogs.push(msg));

    logger.debug("should be suppressed");
    expect(debugLogs).toHaveLength(0);
  });

  it.todo("reads log level from POWERTOOLS_LOG_LEVEL env var");
  it.todo("merges persistentKeys into every log entry");
  it.todo("devMode does not suppress any log levels");
});
