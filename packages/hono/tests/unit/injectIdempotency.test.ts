import { describe, it } from "vitest";

describe("injectIdempotency (Hono middleware)", () => {
  it.todo("passes through normally when no idempotency-key header is present");
  it.todo("returns cached response on duplicate request within TTL");
  it.todo("returns 409 Conflict when an identical request is in-progress");
  it.todo("stores the response body and status on first successful execution");
  it.todo("does not cache when the handler returns a non-2xx status");
  it.todo("uses a custom header name when provided via options");
});
