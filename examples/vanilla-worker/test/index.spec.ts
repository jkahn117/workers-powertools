/**
 * Integration tests for the vanilla-worker Items API.
 *
 * These tests run inside the Workers runtime via @cloudflare/vitest-pool-workers.
 * SELF dispatches requests through the full Worker fetch handler, so bindings,
 * compatibility flags, and the Workers runtime environment are all active.
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
  // Add these once you have wired in the powertools utilities.

  describe("Logger (after Step 1)", () => {
    it.todo("every response includes a cf-ray or x-request-id correlation ID");
    // Tip: check response headers, or inspect Workers Logs in the dashboard.
    // For unit-style tests, spy on console.log inside the worker module.
  });

  describe("Metrics (after Step 3)", () => {
    it.todo("itemCreated metric is recorded on POST /items");
    // Tip: mock env.ANALYTICS.writeDataPoint and assert it was called.
  });

  describe("Idempotency (after Step 4)", () => {
    it.todo("second POST with same Idempotency-Key returns 200 with stored result");
    it.todo("second POST with same key while first is in-progress returns 409");
  });
});
