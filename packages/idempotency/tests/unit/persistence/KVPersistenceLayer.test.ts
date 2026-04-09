import { describe, it, expect, vi, beforeEach } from "vitest";
import { KVPersistenceLayer } from "../../../src/kv";

/** Minimal KVNamespace mock. */
function makeKVBinding() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

describe("KVPersistenceLayer", () => {
  let binding: ReturnType<typeof makeKVBinding>;
  let layer: KVPersistenceLayer;

  beforeEach(() => {
    binding = makeKVBinding();
    layer = new KVPersistenceLayer({
      binding: binding as unknown as KVNamespace,
    });
  });

  it("returns undefined when no record exists", async () => {
    const result = await layer.getRecord("missing-key");
    expect(result).toBeUndefined();
  });

  it("stores and retrieves a record", async () => {
    const record = {
      idempotencyKey: "key-1",
      status: "COMPLETED" as const,
      expiresAt: Date.now() + 60_000,
      result: { ok: true },
    };

    await layer.putRecord(record);
    const retrieved = await layer.getRecord("key-1");

    expect(retrieved).toMatchObject({ status: "COMPLETED" });
    expect(retrieved?.result).toEqual({ ok: true });
  });

  it("returns undefined for an expired record and deletes it", async () => {
    await layer.putRecord({
      idempotencyKey: "expired-key",
      status: "COMPLETED" as const,
      expiresAt: Date.now() - 1000, // already expired
    });

    const result = await layer.getRecord("expired-key");
    expect(result).toBeUndefined();
    expect(binding.delete).toHaveBeenCalled();
  });

  it("deleteRecord removes the key", async () => {
    await layer.putRecord({
      idempotencyKey: "del-key",
      status: "IN_PROGRESS" as const,
      expiresAt: Date.now() + 60_000,
    });

    await layer.deleteRecord("del-key");
    expect(binding.delete).toHaveBeenCalledWith("idempotency:del-key");
  });

  it.todo("respects a custom keyPrefix option");
  it.todo("passes expirationTtl to KV put");
  it.todo("updateRecord overwrites an existing record");
});
