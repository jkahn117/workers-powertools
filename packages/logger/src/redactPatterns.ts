/**
 * Built-in PII redaction patterns for use with Logger's `redact` config.
 *
 * @example
 * ```ts
 * import { BUILTIN_REDACT_PATTERNS } from "@workers-powertools/logger/redact";
 *
 * const logger = new Logger({
 *   redact: {
 *     enabled: true,
 *     patterns: Object.values(BUILTIN_REDACT_PATTERNS),
 *   },
 * });
 * ```
 */
export const BUILTIN_REDACT_PATTERNS = {
  card: { regex: /\b(?:\d[ -]*?){13,19}\b/g, replacement: "[REDACTED_CARD]" },
  email: { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  ipv4: { regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g, replacement: "[REDACTED_IP]" },
  jwt: { regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replacement: "[REDACTED_JWT]" },
} as const;

export type { RedactConfig } from "./redact";
