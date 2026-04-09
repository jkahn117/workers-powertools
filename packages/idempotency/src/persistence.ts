/**
 * Status of an idempotency record.
 */
export type IdempotencyStatus = "IN_PROGRESS" | "COMPLETED" | "EXPIRED";

/**
 * A stored idempotency record.
 */
export interface IdempotencyRecord {
  /** The idempotency key (hash of the event payload subset). */
  idempotencyKey: string;

  /** Current status of this execution. */
  status: IdempotencyStatus;

  /** Unix timestamp (ms) when this record expires. */
  expiresAt: number;

  /** Stored result from the first successful execution. */
  result?: unknown;

  /** Hash of the input payload for validation. */
  payloadHash?: string;
}

/**
 * Abstract interface for idempotency record storage.
 * Implementations are provided for KV, D1, etc.
 */
export interface PersistenceLayer {
  /**
   * Get an existing idempotency record by key.
   * Returns undefined if no record exists or the record has expired.
   */
  getRecord(idempotencyKey: string): Promise<IdempotencyRecord | undefined>;

  /**
   * Save a new idempotency record with IN_PROGRESS status.
   * Should throw if a non-expired record already exists (optimistic lock).
   */
  putRecord(record: IdempotencyRecord): Promise<void>;

  /**
   * Update an existing record (e.g., to set status to COMPLETED with result).
   */
  updateRecord(record: IdempotencyRecord): Promise<void>;

  /**
   * Delete an idempotency record (e.g., on execution failure).
   */
  deleteRecord(idempotencyKey: string): Promise<void>;
}
