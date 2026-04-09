import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/logger";

describe("Logger / working with keys", () => {
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

  it("persistent keys appear in every log entry", () => {
    const logger = new Logger({
      persistentKeys: { environment: "prod", version: "1.0.0" },
    });

    logger.info("first");
    logger.info("second");

    expect(logs[0]).toMatchObject({ environment: "prod", version: "1.0.0" });
    expect(logs[1]).toMatchObject({ environment: "prod", version: "1.0.0" });
  });

  it("appendPersistentKeys merges into existing persistent keys", () => {
    const logger = new Logger({ persistentKeys: { environment: "prod" } });
    logger.appendPersistentKeys({ requestId: "abc-123" });

    logger.info("test");

    expect(logs[0]).toMatchObject({
      environment: "prod",
      requestId: "abc-123",
    });
  });

  it("temporary keys appear only until cleared", () => {
    const logger = new Logger();
    logger.appendTemporaryKeys({ userId: "u-99" });

    logger.info("with user");
    logger.clearTemporaryKeys();
    logger.info("without user");

    expect(logs[0]).toMatchObject({ userId: "u-99" });
    expect(logs[1]).not.toHaveProperty("userId");
  });

  it.todo("extra keys passed directly to a log call appear only in that entry");
  it.todo("extra keys do not overwrite persistent keys");
});
