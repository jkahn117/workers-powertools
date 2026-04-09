import { describe, it, expect } from "vitest";
import { IdempotencyConfig } from "../../src/config";

describe("IdempotencyConfig", () => {
  it("stores the eventKeyPath", () => {
    const config = new IdempotencyConfig({ eventKeyPath: "orderId" });
    expect(config.eventKeyPath).toBe("orderId");
  });

  it("defaults expiresAfterSeconds to 3600", () => {
    const config = new IdempotencyConfig({ eventKeyPath: "id" });
    expect(config.expiresAfterSeconds).toBe(3600);
  });

  it("accepts a custom expiresAfterSeconds", () => {
    const config = new IdempotencyConfig({
      eventKeyPath: "id",
      expiresAfterSeconds: 7200,
    });
    expect(config.expiresAfterSeconds).toBe(7200);
  });

  it("defaults payloadValidationEnabled to false", () => {
    const config = new IdempotencyConfig({ eventKeyPath: "id" });
    expect(config.payloadValidationEnabled).toBe(false);
  });

  it.todo("payloadValidationEnabled can be set to true");
});
