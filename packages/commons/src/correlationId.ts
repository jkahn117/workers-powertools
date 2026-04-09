import type { CorrelationIdConfig } from "./types";

const DEFAULT_HEADER_NAMES = ["x-request-id", "x-correlation-id", "cf-ray"];

/**
 * Extract a correlation ID from request headers, falling back
 * to auto-generation if configured.
 */
export function extractCorrelationId(
  request: Request,
  config?: CorrelationIdConfig,
): string {
  const headerNames = config?.headerNames ?? DEFAULT_HEADER_NAMES;
  const generateIfMissing = config?.generateIfMissing ?? true;

  for (const name of headerNames) {
    const value = request.headers.get(name);
    if (value) {
      return value;
    }
  }

  if (generateIfMissing) {
    return generateId();
  }

  return "unknown";
}

/**
 * Generate a random identifier suitable for use as a correlation ID.
 * Uses crypto.randomUUID which is available in the Workers runtime.
 */
export function generateId(): string {
  return crypto.randomUUID();
}
