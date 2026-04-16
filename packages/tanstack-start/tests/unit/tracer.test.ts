import { describe, expect, it, vi } from "vitest";
import { injectServerFnTracer, injectTracer } from "../../src/tracer";

describe("injectTracer", () => {
  it("adds request context and wraps the request in a span", async () => {
    const span = { annotations: {} as Record<string, string> };
    const tracer = {
      addContext: vi.fn(),
      getCorrelationId: vi.fn(() => "req-123"),
      captureAsync: vi.fn(
        async (_name: string, callback: (spanArg: typeof span) => unknown) => {
          return await callback(span);
        },
      ),
    };
    const request = new Request("https://example.com/hello");
    const next = vi.fn(async (args?: { context?: Record<string, unknown> }) => ({
      request,
      pathname: "/hello",
      context: args?.context ?? {},
      response: new Response("ok", { status: 201 }),
    }));

    const middleware = injectTracer({ tracer: tracer as never });
    const server = (middleware as { options: { server: Function } }).options.server;

    await server({
      request,
      context: { env: { FOO: "bar" }, ctx: { waitUntil: vi.fn() } },
      next,
      pathname: "/hello",
    });

    expect(tracer.addContext).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ waitUntil: expect.any(Function) }),
      { FOO: "bar" },
    );
    expect(tracer.captureAsync).toHaveBeenCalledWith("GET /hello", expect.any(Function));
    expect(next).toHaveBeenCalledWith({
      context: { tracer, correlationId: "req-123" },
    });
    expect(span.annotations).toEqual({
      "http.method": "GET",
      "http.url": "https://example.com/hello",
      "http.status": "201",
    });
  });
});

describe("injectServerFnTracer", () => {
  it("creates a span around a server function", async () => {
    const span = { annotations: {} as Record<string, string> };
    const tracer = {
      captureAsync: vi.fn(
        async (_name: string, callback: (spanArg: typeof span) => unknown) => {
          return await callback(span);
        },
      ),
    };
    const next = vi.fn(async () => ({ result: "ok" }));

    const middleware = injectServerFnTracer({ tracer: tracer as never });
    const server = (middleware as { options: { server: Function } }).options.server;

    await server({ next, serverFnMeta: { name: "saveOrder" } });

    expect(tracer.captureAsync).toHaveBeenCalledWith(
      "serverFn.saveOrder",
      expect.any(Function),
    );
    expect(span.annotations["serverFn.name"]).toBe("saveOrder");
    expect(next).toHaveBeenCalledOnce();
  });
});
