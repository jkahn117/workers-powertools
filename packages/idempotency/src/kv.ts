/**
 * KV-backed persistence layer for idempotency records.
 *
 * @example
 * ```ts
 * import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";
 *
 * const persistence = new KVPersistenceLayer({ binding: env.IDEMPOTENCY_KV });
 * ```
 */

import type { PersistenceLayer, IdempotencyRecord } from "./persistence";

export class KVPersistenceLayer implements PersistenceLayer {
  private readonly binding: KVNamespace;
  private readonly keyPrefix: string;

  constructor(options: { binding: KVNamespace; keyPrefix?: string }) {
    this.binding = options.binding;
    this.keyPrefix = options.keyPrefix ?? "idempotency";
  }

  private buildKey(idempotencyKey: string): string {
    return `${this.keyPrefix}:${idempotencyKey}`;
  }

  async getRecord(idempotencyKey: string): Promise<IdempotencyRecord | undefined> {
    const raw = await this.binding.get(this.buildKey(idempotencyKey));

    if (!raw) {
      return undefined;
    }

    const record = JSON.parse(raw) as IdempotencyRecord;

    // Check expiration
    if (record.expiresAt < Date.now()) {
      await this.deleteRecord(idempotencyKey);
      return undefined;
    }

    return record;
  }

  async putRecord(record: IdempotencyRecord): Promise<void> {
    const ttlSeconds = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));

    await this.binding.put(this.buildKey(record.idempotencyKey), JSON.stringify(record), {
      expirationTtl: ttlSeconds,
    });
  }

  async updateRecord(record: IdempotencyRecord): Promise<void> {
    // KV put is an upsert, so update is the same operation
    await this.putRecord(record);
  }

  async deleteRecord(idempotencyKey: string): Promise<void> {
    await this.binding.delete(this.buildKey(idempotencyKey));
  }
}
