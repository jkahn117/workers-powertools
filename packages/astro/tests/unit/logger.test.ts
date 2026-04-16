import { describe, expect, it, vi } from "vitest";
import { injectLogger } from "../../src/logger";

describe("injectLogger", () => {
  it("creates a request logger, adds context, and stores it on locals", async () => {
    const requestLogger = {
      addContext: vi.fn(),
      clearTemporaryKeys: vi.fn(),
    };
    const logger = {
      withComponent: vi.fn(() => ({
        child: vi.fn(() => requestLogger),
      })),
    };
    const cfContext = { waitUntil: vi.fn() };
    const locals: Record<string, unknown> = { cfContext };
    const request = new Request("https://example.com/blog/hello");

    const middleware = injectLogger({
      logger: logger as never,
      runtimeEnv: { FOO: "bar" },
      componentName: "astro",
    });

    const response = await middleware(
      {
        request,
        routePattern: "/blog/[slug]",
        url: new URL(request.url),
        locals,
      } as never,
      async () => new Response("ok"),
    );

    expect(response.status).toBe(200);
    expect(logger.withComponent).toHaveBeenCalledWith("astro");
    expect(requestLogger.addContext).toHaveBeenCalledWith(request, cfContext, {
      FOO: "bar",
    });
    expect(locals["logger"]).toBe(requestLogger);
    expect(requestLogger.clearTemporaryKeys).toHaveBeenCalledOnce();
  });
});
