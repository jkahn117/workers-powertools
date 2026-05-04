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
import { IdempotencyConflictError } from "./makeIdempotent";

/**
 * KV-backed persistence layer for idempotency records.
 *
 * **Consistency note:** Workers KV is eventually consistent for reads
 * after writes. This means there is a small race window where two
 * concurrent requests can both pass the `getRecord()` check and both
 * proceed to create an IN_PROGRESS record. For most use cases (webhook
 * deduplication, queue consumers) this is acceptable because the
 * delivery interval is much larger than the KV consistency window
 * (typically < 60 seconds). For strict exactly-once guarantees under
 * high concurrency, use the D1 persistence layer instead, which
 * enforces uniqueness via a SQL PRIMARY KEY constraint.
 */
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

    if (record.expiresAt < Date.now()) {
      await this.deleteRecord(idempotencyKey);
      return undefined;
    }

    return record;
  }

  async putRecord(record: IdempotencyRecord): Promise<void> {
    const key = this.buildKey(record.idempotencyKey);

    // Re-check for an existing non-expired record immediately before
    // writing. This narrows the race window to the KV eventual
    // consistency delay (not eliminable without conditional writes).
    const existing = await this.binding.get(key);
    if (existing) {
      const parsed = JSON.parse(existing) as IdempotencyRecord;
      if (parsed.expiresAt >= Date.now()) {
        throw new IdempotencyConflictError(record.idempotencyKey);
      }
    }

    const ttlSeconds = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));

    await this.binding.put(key, JSON.stringify(record), {
      expirationTtl: ttlSeconds,
    });
  }

  async updateRecord(record: IdempotencyRecord): Promise<void> {
    const ttlSeconds = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));

    await this.binding.put(
      this.buildKey(record.idempotencyKey),
      JSON.stringify(record),
      { expirationTtl: ttlSeconds },
    );
  }

  async deleteRecord(idempotencyKey: string): Promise<void> {
    await this.binding.delete(this.buildKey(idempotencyKey));
  }
}
