import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/logger";

describe("Logger / log buffering", () => {
  let debugLogs: string[];
  let errorLogs: string[];

  beforeEach(() => {
    debugLogs = [];
    errorLogs = [];
    vi.spyOn(console, "debug").mockImplementation((msg: string) => debugLogs.push(msg));
    vi.spyOn(console, "error").mockImplementation((msg: string) => errorLogs.push(msg));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("suppresses below-threshold logs when buffering is enabled", () => {
    const logger = new Logger({
      logLevel: "INFO",
      logBufferingEnabled: true,
    });

    logger.debug("buffered debug");
    expect(debugLogs).toHaveLength(0);
  });

  it("flushes buffered logs when error() is called", () => {
    const logger = new Logger({
      logLevel: "INFO",
      logBufferingEnabled: true,
    });

    logger.debug("buffered debug");
    logger.info("buffered info — above threshold, emitted immediately");
    logger.error("triggers flush");

    // The buffered DEBUG entry should now be emitted
    expect(debugLogs).toHaveLength(1);
  });

  it("clears the buffer after flushing", () => {
    const logger = new Logger({
      logLevel: "INFO",
      logBufferingEnabled: true,
    });

    logger.debug("first debug");
    logger.error("first error — flushes");

    // Reset spy counts
    debugLogs.length = 0;

    logger.debug("second debug");
    logger.error("second error — should only flush second debug");

    expect(debugLogs).toHaveLength(1);
    const entry = JSON.parse(debugLogs[0] ?? "{}");
    expect(entry.message).toBe("second debug");
  });

  it.todo("flushes buffered logs when critical() is called");
  it.todo("does not flush when warn() is called");
});
