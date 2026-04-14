import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeIdempotent, IdempotencyConflictError } from "../../src/makeIdempotent";
import { IdempotencyConfig } from "../../src/config";
import type { PersistenceLayer, IdempotencyRecord } from "../../src/persistence";

/** In-memory persistence layer for unit tests. */
function makeMemoryLayer(): PersistenceLayer & {
  store: Map<string, IdempotencyRecord>;
} {
  const store = new Map<string, IdempotencyRecord>();
  return {
    store,
    async getRecord(key) {
      const record = store.get(key);
      if (!record || record.expiresAt < Date.now()) return undefined;
      return record;
    },
    async putRecord(record) {
      store.set(record.idempotencyKey, record);
    },
    async updateRecord(record) {
      store.set(record.idempotencyKey, record);
    },
    async deleteRecord(key) {
      store.delete(key);
    },
  };
}

describe("makeIdempotent", () => {
  let persistence: ReturnType<typeof makeMemoryLayer>;
  const config = new IdempotencyConfig({
    eventKeyPath: "orderId",
    expiresAfterSeconds: 60,
  });

  beforeEach(() => {
    persistence = makeMemoryLayer();
  });

  it("executes the function on first call", async () => {
    const handler = vi.fn().mockResolvedValue({ status: "ok" });
    const idempotentFn = makeIdempotent(handler, {
      persistenceLayer: persistence,
      config,
    });

    const result = await idempotentFn({ orderId: "order-1" });

    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: "ok" });
  });

  it("returns the stored result on duplicate call without re-executing", async () => {
    const handler = vi.fn().mockResolvedValue({ status: "ok" });
    const idempotentFn = makeIdempotent(handler, {
      persistenceLayer: persistence,
      config,
    });

    await idempotentFn({ orderId: "order-2" });
    const second = await idempotentFn({ orderId: "order-2" });

    expect(handler).toHaveBeenCalledOnce();
    expect(second).toEqual({ status: "ok" });
  });

  it("throws IdempotencyConflictError for an in-progress duplicate", async () => {
    // Manually inject an IN_PROGRESS record
    const key = "order-3";
    // We'll use a slow handler that doesn't resolve before the second call
    let resolve!: () => void;
    const slow = makeIdempotent(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
      { persistenceLayer: persistence, config },
    );

    const first = slow({ orderId: key }); // starts, puts IN_PROGRESS
    // Wait a tick for the record to be written
    await Promise.resolve();

    await expect(slow({ orderId: key })).rejects.toThrow(IdempotencyConflictError);

    resolve();
    await first;
  });

  it("deletes the record when the function throws", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("fail"));
    const idempotentFn = makeIdempotent(handler, {
      persistenceLayer: persistence,
      config,
    });

    await expect(idempotentFn({ orderId: "order-4" })).rejects.toThrow("fail");

    // Record should be gone so the function can be retried
    const _record = await persistence.getRecord(
      /* we don't know the hashed key, so check the store is empty */ "",
    );
    expect(persistence.store.size).toBe(0);
  });

  it.todo("uses nested dot-notation path to extract idempotency key");
  it.todo("stores COMPLETED status with result after successful execution");
  it.todo("respects expiresAfterSeconds TTL");
});
