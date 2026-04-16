import { describe, expect, it, vi } from "vitest";
import { injectObservability } from "../../src/observability";

describe("injectObservability", () => {
  it("composes logger, tracer, and metrics middleware", () => {
    const middleware = injectObservability({
      logger: { withComponent: vi.fn(() => ({ child: vi.fn() })) } as never,
      tracer: {
        addContext: vi.fn(),
        getCorrelationId: vi.fn(),
        captureAsync: vi.fn(),
      } as never,
      metrics: {
        setBackend: vi.fn(),
        setCorrelationId: vi.fn(),
        addMetric: vi.fn(),
        flush: vi.fn(),
        flushSync: vi.fn(),
      } as never,
    });

    const middlewares = (middleware as { options: { middleware: unknown[] } }).options
      .middleware;
    expect(middlewares).toHaveLength(3);
  });
});
