/**
 * Configuration for the idempotency utility.
 */
export class IdempotencyConfig {
  /** Dot-notation path to extract the idempotency key from the event. */
  readonly eventKeyPath: string;

  /** Time-to-live in seconds for idempotency records. */
  readonly expiresAfterSeconds: number;

  /** Whether to validate that the payload hash matches on cache hits. */
  readonly payloadValidationEnabled: boolean;

  constructor(options: {
    eventKeyPath: string;
    expiresAfterSeconds?: number;
    payloadValidationEnabled?: boolean;
  }) {
    this.eventKeyPath = options.eventKeyPath;
    this.expiresAfterSeconds = options.expiresAfterSeconds ?? 3600;
    this.payloadValidationEnabled = options.payloadValidationEnabled ?? false;
  }
}
