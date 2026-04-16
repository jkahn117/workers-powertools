import { describe, expect, it, vi } from "vitest";
import { injectObservability } from "../../src/observability";

describe("injectObservability", () => {
  it("composes logger, tracer, and metrics middleware", async () => {
    const requestLogger = {
      addContext: vi.fn(),
      clearTemporaryKeys: vi.fn(),
    };
    const logger = {
      withComponent: vi.fn(() => ({ child: vi.fn(() => requestLogger) })),
    };
    const tracerSpan = { annotations: {} as Record<string, string> };
    const tracer = {
      addContext: vi.fn(),
      getCorrelationId: vi.fn(() => "req-123"),
      captureAsync: vi.fn(
        async (_name: string, callback: (spanArg: typeof tracerSpan) => unknown) => {
          return await callback(tracerSpan);
        },
      ),
    };
    const flushPromise = Promise.resolve();
    const metrics = {
      setBackend: vi.fn(),
      setCorrelationId: vi.fn(),
      addMetric: vi.fn(),
      flush: vi.fn(() => flushPromise),
      flushSync: vi.fn(),
    };
    const waitUntil = vi.fn();

    const middleware = injectObservability({
      logger: logger as never,
      tracer: tracer as never,
      metrics: metrics as never,
      runtimeEnv: { METRICS_PIPELINE: { send: vi.fn() } },
      componentName: "astro",
    });

    const response = await middleware(
      {
        request: new Request("https://example.com/"),
        routePattern: "/",
        url: new URL("https://example.com/"),
        locals: { cfContext: { waitUntil } },
      } as never,
      async () => new Response("ok"),
    );

    expect(response.status).toBe(200);
    expect(logger.withComponent).toHaveBeenCalledWith("astro");
    expect(tracer.captureAsync).toHaveBeenCalledOnce();
    expect(metrics.addMetric).toHaveBeenCalledTimes(2);
    expect(waitUntil).toHaveBeenCalledWith(flushPromise);
  });
});
