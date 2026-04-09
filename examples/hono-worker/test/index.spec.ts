/**
 * Integration tests for the hono-worker Items API.
 *
 * Same API contract as vanilla-worker — compare how powertools integration
 * differs when using Hono middleware vs. manual wiring in a plain Worker.
 *
 * Run: pnpm test (from this directory)
 */

import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("Items API", () => {
  describe("GET /items", () => {
    it("returns an empty array initially", async () => {
      const response = await SELF.fetch("http://example.com/items");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it.todo("returns created items after POST /items");
  });

  describe("POST /items", () => {
    it("creates an item and returns 201", async () => {
      const response = await SELF.fetch("http://example.com/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Widget" }),
      });
      expect(response.status).toBe(201);
      const item = (await response.json()) as { id: string; name: string };
      expect(item.name).toBe("Widget");
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("returns 400 when name is missing", async () => {
      const response = await SELF.fetch("http://example.com/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
    });

    it.todo("returns the same response on duplicate Idempotency-Key (after Step 4)");
  });

  describe("GET /items/:id", () => {
    it.todo("returns 404 for an unknown item id");
    it.todo("returns the item after it has been created");
  });

  // ── Powertools behaviour ───────────────────────────────────────────────────
  // The Hono middleware wires up powertools at the app level, so these
  // behaviours apply to ALL routes without per-handler boilerplate.

  describe("Logger middleware (after Step 1)", () => {
    it.todo("correlation_id is consistent across log entries within one request");
    // Tip: the injectLogger middleware calls logger.addContext automatically.
    // You don't need to call it in each handler.
  });

  describe("Metrics middleware (after Step 3)", () => {
    it.todo("request_duration metric is recorded for every route");
    it.todo("itemCreated metric is recorded on POST /items");
    // Tip: injectMetrics auto-records duration; custom metrics need explicit calls.
  });

  describe("Idempotency middleware (after Step 4)", () => {
    it.todo("second POST with same Idempotency-Key returns 200 with stored result");
    it.todo("second POST with same key while first is in-progress returns 409");
    // Compare: in vanilla-worker this required wrapping the handler manually.
    // Here, it's a single middleware on the POST /items route.
  });
});
