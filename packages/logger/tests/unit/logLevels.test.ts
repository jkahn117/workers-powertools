import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/logger";

describe("Logger / log levels", () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits INFO and above when logLevel is INFO", () => {
    const logger = new Logger({ logLevel: "INFO" });

    logger.debug("suppressed");
    logger.info("visible");
    logger.warn("visible");
    logger.error("visible");

    expect(consoleSpy.debug).not.toHaveBeenCalled();
    expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
  });

  it("suppresses all output when logLevel is SILENT", () => {
    const logger = new Logger({ logLevel: "SILENT" });

    logger.info("suppressed");
    logger.warn("suppressed");
    logger.error("suppressed");

    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.warn).not.toHaveBeenCalled();
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it("emits all levels when logLevel is TRACE", () => {
    const logger = new Logger({ logLevel: "TRACE" });

    logger.trace("visible");
    logger.debug("visible");

    expect(consoleSpy.debug).toHaveBeenCalledTimes(2);
  });

  it.todo("CRITICAL is written to console.error");
  it.todo("log entries include the correct level field");
});
