import { describe, it, vi, afterEach } from "vitest";

describe("injectLogger (Hono middleware)", () => {
  afterEach(() => vi.restoreAllMocks());

  it.todo("calls logger.addContext with the raw request and executionCtx");
  it.todo("calls logger.clearTemporaryKeys after the handler completes");
  it.todo("calls logger.clearTemporaryKeys even when the handler throws");
  it.todo("does not interfere with the response returned by the handler");
});
