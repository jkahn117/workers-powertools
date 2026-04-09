/**
 * Extract Cloudflare-specific properties from a request's `cf` object.
 * Returns a flat record safe for inclusion in structured log output.
 */
export function extractCfProperties(request: Request): Record<string, unknown> {
  // The `cf` property is a Cloudflare-specific extension on the Request object.
  // It may not exist in non-Workers environments (e.g., tests without mocking).
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;

  if (!cf) {
    return {};
  }

  return {
    colo: cf.colo,
    country: cf.country,
    asn: cf.asn,
    city: cf.city,
    region: cf.region,
    timezone: cf.timezone,
    httpProtocol: cf.httpProtocol,
    tlsVersion: cf.tlsVersion,
  };
}
