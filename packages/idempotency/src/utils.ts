/**
 * Extract a value from a nested object using dot-notation path.
 * e.g., extractKeyFromEvent({ body: { orderId: "123" } }, "body.orderId") => "123"
 */
export function extractKeyFromEvent(event: unknown, keyPath: string): string {
  const parts = keyPath.split(".");
  let current: unknown = event;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      throw new Error(
        `Cannot extract idempotency key: path "${keyPath}" not found in event.`,
      );
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (current === null || current === undefined) {
    throw new Error(`Idempotency key at path "${keyPath}" is null or undefined.`);
  }

  return String(current);
}

/**
 * Create a SHA-256 hash of a string value.
 * Uses the Web Crypto API available in the Workers runtime.
 */
export async function hashPayload(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
