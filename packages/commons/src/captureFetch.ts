/**
 * Make a fetch call with automatic correlation ID propagation.
 *
 * Injects `x-correlation-id` and `x-request-id` headers into the
 * outbound request so downstream services can correlate logs and
 * traces back to the originating request.
 *
 * @example
 * ```ts
 * const response = await captureFetch("https://api.example.com/notify", {
 *   correlationId: extractCorrelationId(request),
 *   init: { method: "POST", body: JSON.stringify({ orderId: "123" }) },
 * });
 * ```
 */
export async function captureFetch(
  input: RequestInfo | URL,
  options?: {
    /** Correlation ID to propagate on outbound headers. */
    correlationId?: string;
    /** Additional headers to include on every outbound request. */
    propagationHeaders?: Record<string, string>;
    /** Standard RequestInit options (method, body, headers, etc.). */
    init?: RequestInit;
  },
): Promise<Response> {
  const headers = new Headers(options?.init?.headers);

  if (options?.correlationId) {
    headers.set("x-correlation-id", options.correlationId);
    headers.set("x-request-id", options.correlationId);
  }

  if (options?.propagationHeaders) {
    for (const [key, value] of Object.entries(options.propagationHeaders)) {
      headers.set(key, value);
    }
  }

  return fetch(input, { ...options?.init, headers });
}
