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
    const request = new Request("https://example.com/orders");
    const waitUntil = vi.fn();
    const binding = { send: vi.fn() };
    const next = vi.fn(async () => ({
      request,
      pathname: "/orders",
      context: {},
      response: new Response("ok", { status: 201 }),
    }));

    const middleware = injectMetrics({ metrics: metrics as never });
    const server = (middleware as { options: { server: Function } }).options.server;

    await server({
      request,
      context: {
        env: { METRICS_PIPELINE: binding },
        ctx: { waitUntil },
        correlationId: "req-123",
      },
      next,
      pathname: "/orders",
    });

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
    expect(waitUntil).toHaveBeenCalledWith(flushPromise);
  });

  it("uses flushSync when ExecutionContext is unavailable", async () => {
    const metrics = {
      setBackend: vi.fn(),
      setCorrelationId: vi.fn(),
      addMetric: vi.fn(),
      flush: vi.fn(),
      flushSync: vi.fn(),
    };
    const request = new Request("https://example.com/orders");
    const next = vi.fn(async () => ({
      request,
      pathname: "/orders",
      context: {},
      response: new Response("ok"),
    }));

    const middleware = injectMetrics({
      metrics: metrics as never,
      captureHttpMetrics: false,
    });
    const server = (middleware as { options: { server: Function } }).options.server;

    await server({
      request,
      context: { env: {} },
      next,
      pathname: "/orders",
    });

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
