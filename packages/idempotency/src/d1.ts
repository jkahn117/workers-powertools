/**
 * D1-backed persistence layer for idempotency records.
 *
 * @example
 * ```ts
 * import { D1PersistenceLayer } from "@workers-powertools/idempotency/d1";
 *
 * const persistence = new D1PersistenceLayer({ binding: env.DB });
 * await persistence.initialize(); // creates table if not exists
 * ```
 */

import type { PersistenceLayer, IdempotencyRecord } from "./persistence";

export class D1PersistenceLayer implements PersistenceLayer {
  private readonly binding: D1Database;
  private readonly tableName: string;

  constructor(options: { binding: D1Database; tableName?: string }) {
    this.binding = options.binding;
    this.tableName = options.tableName ?? "idempotency_records";
  }

  /**
   * Create the idempotency table if it doesn't exist.
   * Call once during setup or on first use.
   */
  async initialize(): Promise<void> {
    await this.binding
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${this.tableName} (
          idempotency_key TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          result TEXT,
          payload_hash TEXT
        )`,
      )
      .run();
  }

  async getRecord(idempotencyKey: string): Promise<IdempotencyRecord | undefined> {
    const row = await this.binding
      .prepare(`SELECT * FROM ${this.tableName} WHERE idempotency_key = ?`)
      .bind(idempotencyKey)
      .first<{
        idempotency_key: string;
        status: string;
        expires_at: number;
        result: string | null;
        payload_hash: string | null;
      }>();

    if (!row) {
      return undefined;
    }

    // Check expiration
    if (row.expires_at < Date.now()) {
      await this.deleteRecord(idempotencyKey);
      return undefined;
    }

    return {
      idempotencyKey: row.idempotency_key,
      status: row.status as IdempotencyRecord["status"],
      expiresAt: row.expires_at,
      result: row.result ? JSON.parse(row.result) : undefined,
      payloadHash: row.payload_hash ?? undefined,
    };
  }

  async putRecord(record: IdempotencyRecord): Promise<void> {
    await this.binding
      .prepare(
        `INSERT INTO ${this.tableName} (idempotency_key, status, expires_at, result, payload_hash)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        record.idempotencyKey,
        record.status,
        record.expiresAt,
        record.result !== undefined ? JSON.stringify(record.result) : null,
        record.payloadHash ?? null,
      )
      .run();
  }

  async updateRecord(record: IdempotencyRecord): Promise<void> {
    await this.binding
      .prepare(
        `UPDATE ${this.tableName}
         SET status = ?, expires_at = ?, result = ?, payload_hash = ?
         WHERE idempotency_key = ?`,
      )
      .bind(
        record.status,
        record.expiresAt,
        record.result !== undefined ? JSON.stringify(record.result) : null,
        record.payloadHash ?? null,
        record.idempotencyKey,
      )
      .run();
  }

  async deleteRecord(idempotencyKey: string): Promise<void> {
    await this.binding
      .prepare(`DELETE FROM ${this.tableName} WHERE idempotency_key = ?`)
      .bind(idempotencyKey)
      .run();
  }
}
