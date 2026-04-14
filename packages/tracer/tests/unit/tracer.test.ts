import { describe, it, expect, vi, afterEach } from "vitest";
import { Tracer } from "../../src/tracer";

describe("Tracer / initialization", () => {
  it("creates a tracer with no config", () => {
    expect(() => new Tracer()).not.toThrow();
  });

  it.todo("uses provided serviceName in emitted spans");
  it.todo("propagateCorrelationId defaults to true");
});

describe("Tracer / addContext", () => {
  afterEach(() => vi.restoreAllMocks());

  it("extracts correlation ID from x-request-id header", () => {
    const tracer = new Tracer();
    tracer.addContext(
      new Request("https://example.com", {
        headers: { "x-request-id": "req-123" },
      }),
    );
    expect(tracer.getCorrelationId()).toBe("req-123");
  });

  it("generates a correlation ID when no header is present", () => {
    const tracer = new Tracer();
    tracer.addContext(new Request("https://example.com"));
    expect(tracer.getCorrelationId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("Tracer / setCorrelationId", () => {
  it("overrides the correlation ID", () => {
    const tracer = new Tracer();
    tracer.setCorrelationId("custom-id");
    expect(tracer.getCorrelationId()).toBe("custom-id");
  });

  it("ignores null and undefined values", () => {
    const tracer = new Tracer();
    tracer.setCorrelationId("initial");
    tracer.setCorrelationId(null);
    expect(tracer.getCorrelationId()).toBe("initial");
  });
});

describe("Tracer / captureAsync", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the result of the wrapped function", async () => {
    const tracer = new Tracer();
    const result = await tracer.captureAsync("op", async () => 42);
    expect(result).toBe(42);
  });

  it("re-throws errors from the wrapped function", async () => {
    const tracer = new Tracer();
    await expect(
      tracer.captureAsync("op", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("emits a span log entry on completion", async () => {
    const logs: unknown[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logs.push(JSON.parse(msg));
    });

    const tracer = new Tracer({ serviceName: "svc" });
    await tracer.captureAsync("myOp", async () => "done");

    const span = logs.find(
      (e) => (e as Record<string, unknown>)["type"] === "trace_span",
    );
    expect(span).toMatchObject({ span_name: "myOp", success: true });
  });

  it("records error message on span when wrapped function throws", async () => {
    const logs: unknown[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logs.push(JSON.parse(msg));
    });

    const tracer = new Tracer();
    await tracer
      .captureAsync("failOp", async () => {
        throw new Error("oops");
      })
      .catch(() => {});

    const span = logs.find(
      (e) => (e as Record<string, unknown>)["type"] === "trace_span",
    ) as Record<string, unknown>;
    expect(span?.["error"]).toBe("oops");
    expect(span?.["success"]).toBe(false);
  });

  it.todo("span includes duration_ms > 0");
  it.todo("span annotations set via span.annotations are included in output");
});

describe("Tracer / captureFetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("propagates x-correlation-id header on outbound fetch", async () => {
    const tracer = new Tracer();
    tracer.setCorrelationId("corr-abc");

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok"));

    await tracer.captureFetch("https://downstream.example.com/api");

    const calledHeaders = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(calledHeaders.get("x-correlation-id")).toBe("corr-abc");
  });

  it.todo("does not propagate header when propagateCorrelationId is false");
  it.todo("merges custom propagationHeaders with correlation headers");
});
