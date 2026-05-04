# @workers-powertools/commons

Shared types, utilities, and base classes used by all Workers Powertools packages.

This package is an internal dependency — you typically don't install it directly. It's consumed by the core packages (`logger`, `metrics`, `tracer`, `idempotency`) and framework adapters (`hono`).

## What's included

- **`PowertoolsBase`** — Abstract base class providing `serviceName`, `devMode`, and `resolveConfig()` for environment variable fallback chains.
- **`extractCorrelationId()`** — Extracts a correlation ID from request headers (`x-request-id`, `x-correlation-id`, `cf-ray`) with auto-generation fallback via `crypto.randomUUID()`.
- **`extractCfProperties()`** — Extracts Cloudflare-specific properties (`colo`, `country`, `asn`, `city`, `region`, `timezone`, `httpProtocol`, `tlsVersion`) from the `request.cf` object.
- **`captureFetch()`** — Makes a fetch call with automatic correlation ID and custom header propagation. Replaces `Tracer.captureFetch()` for outbound correlation.
- **`generateId()`** — Generates a random UUID using the Web Crypto API.

## Types

- **`PowertoolsConfig`** — Base configuration (`serviceName`, `devMode`) shared across all utilities.
- **`WorkersContext`** — Normalized representation of Workers execution context and CF properties.
- **`CorrelationIdConfig`** — Configuration for correlation ID extraction (`headerNames`, `generateIfMissing`).

## Installation

```bash
pnpm add @workers-powertools/commons
```

## Usage

```typescript
import { extractCorrelationId, extractCfProperties, captureFetch } from "@workers-powertools/commons";

const correlationId = extractCorrelationId(request);
const cfProperties = extractCfProperties(request);

// Propagate correlation ID on outbound requests
const response = await captureFetch("https://api.example.com/notify", {
  correlationId,
  init: { method: "POST", body: JSON.stringify({ event: "order.created" }) },
});
```
