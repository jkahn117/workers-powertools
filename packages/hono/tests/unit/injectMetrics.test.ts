import { describe, it } from "vitest";

describe("injectMetrics (Hono middleware)", () => {
  it.todo("calls metrics.setBinding with the Analytics Engine binding from env");
  it.todo("adds route and method as dimensions");
  it.todo("records request_duration in milliseconds");
  it.todo("records request_count of 1 per invocation");
  it.todo("adds HTTP status as a dimension after the handler runs");
  it.todo("calls ctx.waitUntil(metrics.flush()) so flush is non-blocking");
});
