import { describe, expect, it, vi } from "vitest";
import { PipelinesBackend } from "@workers-powertools/metrics/pipelines";
import { getMetricsBackendFromEnv, injectMetrics } from "../../src/metrics";

describe("injectMetrics", () => {
  it("sets the backend, records HTTP metrics, and flushes with waitUntil", async () => {
    const flushPromise = Promise.resolve();
    const metrics = {
      setBackend: vi.fn(),
      setCorrelationId: vi.fn(),
      addMetric: vi.fn(),
      flush: vi.fn(() => flushPromise),
      flushSync: vi.fn(),
    };
    const cfContext = { waitUntil: vi.fn() };
    const locals: Record<string, unknown> = { cfContext, correlationId: "req-123" };
    const request = new Request("https://example.com/orders");

    const middleware = injectMetrics({
      metrics: metrics as never,
      runtimeEnv: { METRICS_PIPELINE: { send: vi.fn() } },
    });

    const response = await middleware(
      {
        request,
        routePattern: "/orders",
        url: new URL(request.url),
        locals,
      } as never,
      async () => new Response("ok", { status: 201 }),
    );

    expect(response.status).toBe(201);
    expect(metrics.setBackend).toHaveBeenCalledWith(expect.any(PipelinesBackend));
    expect(metrics.setCorrelationId).toHaveBeenCalledWith("req-123");
    expect(metrics.addMetric).toHaveBeenNthCalledWith(
      1,
      "request_duration",
      "Milliseconds",
      expect.any(Number),
      { method: "GET", route: "/orders", status: "201" },
    );
    expect(metrics.addMetric).toHaveBeenNthCalledWith(2, "request_count", "Count", 1, {
      method: "GET",
      route: "/orders",
      status: "201",
    });
    expect(locals["metrics"]).toBe(metrics);
    expect(cfContext.waitUntil).toHaveBeenCalledWith(flushPromise);
  });

  it("uses flushSync when cfContext is unavailable", async () => {
    const metrics = {
      setBackend: vi.fn(),
      setCorrelationId: vi.fn(),
      addMetric: vi.fn(),
      flush: vi.fn(),
      flushSync: vi.fn(),
    };
    const request = new Request("https://example.com/orders");

    const middleware = injectMetrics({
      metrics: metrics as never,
      runtimeEnv: {},
      captureHttpMetrics: false,
    });

    await middleware(
      {
        request,
        routePattern: "/orders",
        url: new URL(request.url),
        locals: {},
      } as never,
      async () => new Response("ok"),
    );

    expect(metrics.flushSync).toHaveBeenCalledOnce();
    expect(metrics.addMetric).not.toHaveBeenCalled();
  });
});

describe("getMetricsBackendFromEnv", () => {
  it("returns undefined when the binding is missing", () => {
    expect(getMetricsBackendFromEnv({})).toBeUndefined();
  });

  it("returns a PipelinesBackend when the binding exists", () => {
    const backend = getMetricsBackendFromEnv({ METRICS_PIPELINE: { send: vi.fn() } });
    expect(backend).toBeInstanceOf(PipelinesBackend);
  });
});
