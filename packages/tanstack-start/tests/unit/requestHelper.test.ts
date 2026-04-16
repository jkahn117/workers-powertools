import { describe, expect, it, vi } from "vitest";
import { withStartRequestObservability } from "../../src/requestHelper";

describe("withStartRequestObservability", () => {
  it("injects request-scoped utilities and flushes metrics", async () => {
    const requestLogger = {
      addContext: vi.fn(),
      clearTemporaryKeys: vi.fn(),
    };
    const logger = {
      withComponent: vi.fn(() => ({
        child: vi.fn(() => requestLogger),
      })),
    };
    const tracer = {
      addContext: vi.fn(),
      getCorrelationId: vi.fn(() => "req-123"),
    };
    const flushPromise = Promise.resolve();
    const metrics = {
      setBackend: vi.fn(),
      setCorrelationId: vi.fn(),
      flush: vi.fn(() => flushPromise),
    };
    const handle = vi.fn(async ({ context }: { context: Record<string, unknown> }) => {
      expect(context["env"]).toEqual({
        METRICS_PIPELINE: { send: expect.any(Function) },
      });
      expect(context["logger"]).toBe(requestLogger);
      expect(context["tracer"]).toBe(tracer);
      expect(context["metrics"]).toBe(metrics);
      expect(context["correlationId"]).toBe("req-123");
      return new Response("ok");
    });
    const waitUntil = vi.fn();
    const request = new Request("https://example.com/hello");

    const response = await withStartRequestObservability({
      request,
      env: { METRICS_PIPELINE: { send: vi.fn() } },
      ctx: { waitUntil } as never,
      logger: logger as never,
      tracer: tracer as never,
      metrics: metrics as never,
      handle,
    });

    expect(response.status).toBe(200);
    expect(requestLogger.addContext).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ waitUntil: expect.any(Function) }),
      { METRICS_PIPELINE: { send: expect.any(Function) } },
    );
    expect(tracer.addContext).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ waitUntil: expect.any(Function) }),
      { METRICS_PIPELINE: { send: expect.any(Function) } },
    );
    expect(metrics.setBackend).toHaveBeenCalledOnce();
    expect(metrics.setCorrelationId).toHaveBeenCalledWith("req-123");
    expect(waitUntil).toHaveBeenCalledWith(flushPromise);
    expect(requestLogger.clearTemporaryKeys).toHaveBeenCalledOnce();
  });
});
