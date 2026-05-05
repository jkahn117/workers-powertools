import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureFetch } from "../../src/captureFetch";

describe("captureFetch", () => {
  const mockResponse = new Response("ok", { status: 200 });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));
  });

  it("calls fetch with the input URL", async () => {
    await captureFetch("https://api.example.com/data");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("propagates correlation ID as x-correlation-id and x-request-id", async () => {
    await captureFetch("https://api.example.com/data", {
      correlationId: "req-123",
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as Headers;
    expect(headers.get("x-correlation-id")).toBe("req-123");
    expect(headers.get("x-request-id")).toBe("req-123");
  });

  it("does not set correlation headers when correlationId is undefined", async () => {
    await captureFetch("https://api.example.com/data");

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as Headers;
    expect(headers.has("x-correlation-id")).toBe(false);
    expect(headers.has("x-request-id")).toBe(false);
  });

  it("includes custom propagation headers", async () => {
    await captureFetch("https://api.example.com/data", {
      correlationId: "req-123",
      propagationHeaders: { "x-custom": "value" },
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as Headers;
    expect(headers.get("x-custom")).toBe("value");
  });

  it("forwards RequestInit options (method, body)", async () => {
    await captureFetch("https://api.example.com/data", {
      init: { method: "POST", body: "test" },
    });

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[1]?.method).toBe("POST");
    expect(call[1]?.body).toBe("test");
  });

  it("merges headers from init with correlation headers", async () => {
    await captureFetch("https://api.example.com/data", {
      correlationId: "req-456",
      init: { headers: { "content-type": "application/json" } },
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as Headers;
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-correlation-id")).toBe("req-456");
  });

  it("returns the fetch response", async () => {
    const result = await captureFetch("https://api.example.com/data");
    expect(result).toBe(mockResponse);
  });
});
