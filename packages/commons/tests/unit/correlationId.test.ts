import { describe, it, expect } from "vitest";
import { extractCorrelationId, generateId } from "../../src/correlationId";

describe("extractCorrelationId", () => {
  it("extracts correlation ID from x-request-id header", () => {
    const request = new Request("https://example.com", {
      headers: { "x-request-id": "test-123" },
    });

    expect(extractCorrelationId(request)).toBe("test-123");
  });

  it("falls back to x-correlation-id header", () => {
    const request = new Request("https://example.com", {
      headers: { "x-correlation-id": "corr-456" },
    });

    expect(extractCorrelationId(request)).toBe("corr-456");
  });

  it("generates a UUID when no header is present", () => {
    const request = new Request("https://example.com");
    const id = extractCorrelationId(request);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("returns 'unknown' when generation is disabled and no header is present", () => {
    const request = new Request("https://example.com");
    const id = extractCorrelationId(request, { generateIfMissing: false });

    expect(id).toBe("unknown");
  });

  it("respects custom header names", () => {
    const request = new Request("https://example.com", {
      headers: { "x-trace-id": "trace-789" },
    });

    const id = extractCorrelationId(request, {
      headerNames: ["x-trace-id"],
    });

    expect(id).toBe("trace-789");
  });
});

describe("generateId", () => {
  it("returns a valid UUID v4 string", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
