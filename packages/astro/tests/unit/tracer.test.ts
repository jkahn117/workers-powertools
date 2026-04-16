import { describe, expect, it, vi } from "vitest";
import { injectTracer } from "../../src/tracer";

describe("injectTracer", () => {
  it("adds request context, sets locals, and wraps the request in a span", async () => {
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
    const cfContext = { waitUntil: vi.fn() };
    const locals: Record<string, unknown> = { cfContext };
    const request = new Request("https://example.com/blog/hello");

    const middleware = injectTracer({
      tracer: tracer as never,
      runtimeEnv: { FOO: "bar" },
    });

    const response = await middleware(
      {
        request,
        routePattern: "/blog/[slug]",
        url: new URL(request.url),
        locals,
      } as never,
      async () => new Response("ok", { status: 201 }),
    );

    expect(response.status).toBe(201);
    expect(tracer.addContext).toHaveBeenCalledWith(request, cfContext, { FOO: "bar" });
    expect(tracer.captureAsync).toHaveBeenCalledWith(
      "GET /blog/[slug]",
      expect.any(Function),
    );
    expect(locals["tracer"]).toBe(tracer);
    expect(locals["correlationId"]).toBe("req-123");
    expect(span.annotations).toEqual({
      "http.method": "GET",
      "http.route": "/blog/[slug]",
      "http.url": "https://example.com/blog/hello",
      "http.status": "201",
    });
  });
});
