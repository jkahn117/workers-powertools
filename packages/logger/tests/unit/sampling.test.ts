import { describe, it, expect, vi, afterEach } from "vitest";
import { Logger } from "../../src/logger";

describe("Logger / debug sampling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("elevates to DEBUG level when random value is below debugSampleRate", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.005); // below 1%

    const debugLogs: string[] = [];
    vi.spyOn(console, "debug").mockImplementation((msg: string) => debugLogs.push(msg));

    const logger = new Logger({ logLevel: "INFO", debugSampleRate: 0.01 });
    logger.addContext(new Request("https://example.com"));
    logger.debug("sampled debug");

    expect(debugLogs).toHaveLength(1);
  });

  it("does not elevate when random value is above debugSampleRate", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // above 1%

    const debugLogs: string[] = [];
    vi.spyOn(console, "debug").mockImplementation((msg: string) => debugLogs.push(msg));

    const logger = new Logger({ logLevel: "INFO", debugSampleRate: 0.01 });
    logger.addContext(new Request("https://example.com"));
    logger.debug("not sampled");

    expect(debugLogs).toHaveLength(0);
  });

  it.todo("debugSampleRate of 0 never elevates log level (default)");
  it.todo("debugSampleRate of 1 always elevates log level");
});
