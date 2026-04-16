import { describe, expect, it, vi } from "vitest";
import { injectLogger } from "../../src/logger";

describe("injectLogger", () => {
  it("creates a request logger, adds context, and clears temporary keys", async () => {
    const requestLogger = {
      addContext: vi.fn(),
      clearTemporaryKeys: vi.fn(),
    };
    const logger = {
      withComponent: vi.fn(() => ({
        child: vi.fn(() => requestLogger),
      })),
    };
    const request = new Request("https://example.com/hello");
    const ctx = { waitUntil: vi.fn() };
    const next = vi.fn(async (args?: { context?: Record<string, unknown> }) => ({
      request,
      pathname: "/hello",
      context: args?.context ?? {},
      response: new Response("ok"),
    }));

    const middleware = injectLogger({ logger: logger as never, componentName: "app" });
    const server = (middleware as { options: { server: Function } }).options.server;

    await server({
      request,
      context: { env: { FOO: "bar" }, ctx },
      next,
      pathname: "/hello",
    });

    expect(logger.withComponent).toHaveBeenCalledWith("app");
    expect(requestLogger.addContext).toHaveBeenCalledWith(request, ctx, { FOO: "bar" });
    expect(next).toHaveBeenCalledWith({ context: { logger: requestLogger } });
    expect(requestLogger.clearTemporaryKeys).toHaveBeenCalledOnce();
  });
});
