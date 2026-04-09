import { describe, it } from "vitest";

describe("injectTracer (Hono middleware)", () => {
  it.todo("calls tracer.addContext with the raw request and executionCtx");
  it.todo("wraps the handler in a captureAsync span named 'METHOD /route'");
  it.todo("annotates the span with method, route, url, and status");
  it.todo("re-throws errors after recording the span");
  it.todo("span name uses the matched Hono route pattern, not the raw URL");
});
