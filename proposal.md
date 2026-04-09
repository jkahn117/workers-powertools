# Powertools for Cloudflare Workers

> A developer toolkit to implement observability and reliability best practices for Cloudflare Workers, inspired by [Powertools for AWS Lambda (TypeScript)](https://docs.powertools.aws.dev/lambda/typescript/latest/).

## Motivation

Cloudflare Workers has matured significantly -- Workers Logs (GA), automatic tracing (beta), and Analytics Engine provide the underlying infrastructure for observability. But developers still need to write repetitive boilerplate to get structured logging, consistent metrics, request correlation, and other production-readiness patterns.

Powertools for Lambda solved this for the AWS ecosystem and is widely adopted (~1.8k GitHub stars, used by dozens of companies). The same developer experience gap exists in the Workers ecosystem today.

**This project aims to be the missing "best practices SDK" for Cloudflare Workers.**

## References

The following works directly inform the observability philosophy of this project. They are cited throughout the proposal and should be treated as required reading before making significant design decisions on the Logger and Tracer utilities.

### Primary References

| Author                      | Title                                                                                                                                                                     | Key Contribution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brandur Leach (Stripe)      | [Canonical Log Lines](https://stripe.com/blog/canonical-log-lines) (2019)                                                                                                 | Coined the "canonical log line" pattern: one information-dense structured log entry per request per service, colocated for fast querying. Introduced the concept that logs should be optimised for _querying_, not _writing_. Used in production at Stripe across every service.                                                                                                                                                                                                                                                                  |
| Boris Tane                  | [Logging Sucks](https://loggingsucks.com/) (2024)                                                                                                                         | Argues that traditional logging — many narrow lines per request — is fundamentally broken for distributed systems. Defines **wide events** (one event per request, 50+ fields), **cardinality** (unique values a field can have), and **dimensionality** (number of fields). Makes the case for tail sampling: make the keep/drop decision _after_ the request completes based on outcome.                                                                                                                                                        |
| Jeremy Morrell              | [A Practitioner's Guide to Wide Events](https://jeremymorrell.dev/blog/a-practitioners-guide-to-wide-events/) (2024)                                                      | The most operationally detailed guide. Covers ~100 specific fields to add across service metadata, build info, HTTP, user/customer context, rate limits, caching, feature flags, errors, and timings. Introduces the "main span" pattern: save a reference to the root span in context so business context can always be written to it regardless of nesting depth. Addresses the "repeated data" objection with column-store compression analysis.                                                                                               |
| Lambros Petrou (Cloudflare) | [Tracing is better with wide events AND (sub)spans](https://wiki.cfdata.org/spaces/PS/blog/2026/02/06/1346667932/Tracing+is+better+with+wide+events+AND+sub+spans) (2026) | Internal Cloudflare analysis arguing that a _single_ wide event per service is insufficient for operations that repeat within a request (retries, lock contention, batch loops). The same operation appearing multiple times cannot be faithfully represented in a flat key-value structure without losing ordering and individual timings. Proposes the "mega wide event": a virtual merged event per service entrypoint that inherits attributes from all sub-spans, enabling wide-event-style querying without sacrificing sub-span precision. |

## Tenets

1. **Cloudflare Workers first.** Optimize for the Workers runtime, its constraints (no Node.js `process`, CPU time limits, isolate model), and its native primitives (bindings, `ctx.waitUntil`, `ExecutionContext`).
2. **Progressive adoption.** Each utility is independent. Adopt one, a few, or all. No lock-in to the full toolkit.
3. **Keep it lean.** Zero or near-zero external dependencies. Workers are sensitive to bundle size and cold start. Every dependency is a deliberate choice.
4. **Framework-agnostic core, framework adapters optional.** Core utilities work with plain `fetch` handlers. Optional middleware packages for Hono, itty-router, etc.
5. **Leverage the platform.** Use Workers-native features (Analytics Engine, Workers Logs, built-in tracing, `ctx.waitUntil`) rather than reimplementing infrastructure.

## Feature Portability Analysis

| Lambda Powertools Feature                     | Portable? | Workers Equivalent / Notes                                                                                                            |
| --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Logger**                                    | Yes       | High value. `console.log` is unstructured. Workers Logs stores raw output -- structured JSON makes it queryable.                      |
| **Metrics**                                   | Yes       | Analytics Engine replaces CloudWatch EMF. Non-blocking writes, SQL-queryable.                                                         |
| **Tracer**                                    | Partial   | Workers now has automatic tracing (beta). Value-add is enrichment: custom spans, annotations, correlation IDs on traces.              |
| **Idempotency**                               | Yes       | Very useful for Workers handling webhooks, payment callbacks, queue consumers. Use KV or D1 as persistence layer instead of DynamoDB. |
| **Data Masking** _(Python only)_              | Yes       | Erase/mask PII in logs and responses. Web Crypto API replaces AWS KMS for encryption. High regulatory value.                          |
| **Feature Flags** _(Python only)_             | Yes       | Rule engine backed by KV/D1 instead of AppConfig. Useful for gradual rollouts, A/B testing, time-based toggles.                       |
| **Event Source Data Classes** _(Python only)_ | Yes       | Typed classes for Queue messages, Email events, Cron triggers, R2 notifications, Tail Worker events.                                  |
| **Parser / Validation**                       | Yes       | Zod-based request validation is framework-agnostic and directly portable.                                                             |
| **Parameters**                                | Low       | Workers use env bindings and Secrets Store, not SSM/Secrets Manager. Less need for a parameters abstraction.                          |
| **Batch Processing**                          | Partial   | Relevant for Queue consumers. Simpler model than SQS/Kinesis but partial failure handling is still useful.                            |
| **Event Handler**                             | No        | Hono/itty-router already fill this niche. Not worth duplicating.                                                                      |
| **Streaming** _(Python only)_                 | Low       | Workers already stream-first via Streams API. R2 `get()` returns `ReadableStream` natively.                                           |
| **Middleware Factory** _(Python only)_        | No        | Hono middleware, TypeScript function composition, itty-router `onRequest` already cover this.                                         |
| **JMESPath**                                  | No        | Niche. Zod/TypeScript-first validation is more idiomatic.                                                                             |

## v1 Scope: Core Features

Based on the analysis above, v1 focuses on the four highest-impact, most portable features:

1. **Logger** -- Structured logging with Workers context enrichment
2. **Metrics** -- Custom metrics via Analytics Engine
3. **Tracer** -- Request correlation and trace enrichment
4. **Idempotency** -- Prevent duplicate execution for exactly-once semantics

---

## Feature 1: Logger (`@workers-powertools/logger`)

### Problem

`console.log("something happened")` gives you an unstructured string in Workers Logs. When debugging production issues, you need structured fields, correlation IDs, consistent log levels, and contextual metadata (which Worker, which request, what bindings were used).

### Key Features

- **Structured JSON output** -- All logs emitted as JSON objects with consistent schema ✓
- **Workers context enrichment** -- Automatically inject Worker name, environment, CF properties (colo, country, ASN) from `request.cf` ✓
- **Correlation IDs** -- Extract or generate a request correlation ID (from `X-Request-Id`, `X-Correlation-Id`, or `cf-ray`), propagated through the request lifecycle ✓
- **Log levels** -- `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `CRITICAL`, `SILENT` ✓
- **Persistent and temporary keys** -- Append contextual metadata (user ID, tenant, etc.) that persists across log calls within a request ✓
- **Log buffering** -- Buffer low-severity logs, flush synchronously on error ✓ _(deferred: async flush via `ctx.waitUntil` is a v2 item — see below)_
- **Debug log sampling** -- Probabilistic log level elevation (e.g., "emit DEBUG-level logs for 1% of requests, INFO for the rest"). This is distinct from wrangler's `head_sampling_rate`, which controls whether a request is logged _at all_. Debug sampling controls _verbosity_ per request ✓
- **`POWERTOOLS_LOG_LEVEL` env-var control** -- _(not yet implemented; log level must be set in constructor for now)_
- **`cf-ray` in log output** -- _(not yet implemented; `cf-ray` is used for correlation ID extraction but is not yet added as a log field)_
- **Child loggers** -- Scoped loggers for sub-operations that inherit parent context _(deferred to v2)_
- **Custom formatters** -- Bring your own log format for compatibility with existing log pipelines _(deferred to v2)_

### Approach

```typescript
import { Logger } from "@workers-powertools/logger";

const logger = new Logger({
  serviceName: "payment-api",
  logLevel: "INFO", // or via POWERTOOLS_LOG_LEVEL env var
  persistentKeys: {
    environment: "production",
    version: "1.2.0",
  },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Automatically enriches with CF properties, ray ID, colo, etc.
    logger.addContext(request, ctx);

    logger.info("Processing payment", { orderId: "12345" });

    try {
      const result = await processPayment(request);
      logger.info("Payment succeeded", { result });
      return new Response(JSON.stringify(result));
    } catch (error) {
      logger.error("Payment failed", error as Error);
      return new Response("Internal Error", { status: 500 });
    }
  },
};
```

**Output:**

```json
{
  "level": "INFO",
  "message": "Processing payment",
  "timestamp": "2026-04-08T12:00:00.000Z",
  "service": "payment-api",
  "environment": "production",
  "version": "1.2.0",
  "correlation_id": "abc-123-def",
  "colo": "SJC",
  "country": "US",
  "orderId": "12345"
}
```

> `cf_ray` will be added as an explicit log field in a future version. Currently `cf-ray` is used as a fallback correlation ID source but is not included in the log output separately.

### Workers-Specific Design Decisions

- **No `process.env` dependency.** Log level is set in constructor. _(Env-var control via `POWERTOOLS_LOG_LEVEL` is not yet implemented — planned for v2 alongside the `resolveConfig` env-var pipeline.)_
- **Cold start detection.** Uses isolate lifecycle (first request to an isolate instance) rather than Lambda's container reuse model. _(Not yet implemented in current Logger — planned for v2.)_
- **`ctx.waitUntil` integration.** The current implementation flushes buffered logs synchronously inline on `error()`/`critical()`. Deferred async flush via `ctx.waitUntil` is planned for v2 to avoid any potential latency impact.
- **CF request properties.** Automatically extracts `cf.colo`, `cf.country`, `cf.asn`, `cf.city`, `cf.region`, `cf.timezone`, `cf.httpProtocol`, `cf.tlsVersion` from `request.cf`. The `cf-ray` header is used for correlation ID extraction but is not yet emitted as a separate log field.

### Hono Middleware (`@workers-powertools/hono`)

All framework adapters for a given framework are bundled into a single package — one install regardless of how many utilities you use. See [Package Structure](#package-structure) for the rationale.

```typescript
import { Hono } from "hono";
import { Logger } from "@workers-powertools/logger";
import { injectLogger } from "@workers-powertools/hono";

const logger = new Logger({ serviceName: "my-api" });
const app = new Hono();

app.use(injectLogger(logger)); // auto-enriches from c.req, c.executionCtx

app.get("/hello", (c) => {
  logger.info("Hello endpoint hit");
  return c.json({ message: "hello" });
});
```

---

## Feature 2: Metrics (`@workers-powertools/metrics`)

### Problem

Workers provides built-in request metrics (invocation counts, CPU time, errors) via the dashboard and GraphQL API, but there's no ergonomic way to emit custom application-level metrics. Analytics Engine is the underlying primitive, but its API is low-level (`writeDataPoint` with blobs/doubles arrays).

### Key Features

- **Named metrics with units** -- `metrics.addMetric('orderProcessed', MetricUnit.Count, 1)` instead of raw `writeDataPoint`
- **Dimensions** -- Add key-value dimensions for slicing metrics (service, environment, endpoint, customer tier)
- **Default dimensions** -- Set dimensions once (service name, environment), applied to all metrics
- **Cold start metric** -- Automatically emit a `ColdStart` metric on first request to an isolate
- **Batching** -- Aggregate multiple metrics within a request and flush once via `ctx.waitUntil`
- **Metadata** -- Attach high-cardinality data (request IDs, user IDs) that's logged alongside metrics but not used as dimensions
- **Validation** -- Warn or error on common mistakes (missing namespace, too many dimensions)

### Approach

```typescript
import { Metrics, MetricUnit } from "@workers-powertools/metrics";

const metrics = new Metrics({
  namespace: "ecommerce", // maps to Analytics Engine dataset
  serviceName: "orders",
  defaultDimensions: { environment: "production" },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    metrics.setBinding(env.ANALYTICS); // Analytics Engine binding

    metrics.addMetric("orderReceived", MetricUnit.Count, 1);
    metrics.addDimension("endpoint", "/orders");

    const start = Date.now();
    const result = await processOrder(request);
    const duration = Date.now() - start;

    metrics.addMetric("orderLatency", MetricUnit.Milliseconds, duration);
    metrics.addMetric("orderValue", MetricUnit.None, result.total);

    // Flush via waitUntil so it doesn't block the response
    ctx.waitUntil(metrics.flush());

    return new Response(JSON.stringify(result));
  },
};
```

### Workers-Specific Design Decisions

- **Analytics Engine as primary backend.** Maps namespace to AE dataset, dimensions to blobs, metric values to doubles. Writes are non-blocking by design.
- **`ctx.waitUntil` for flush.** Metric writes happen after the response is sent, zero impact on latency.
- **Blob/double mapping.** AE supports 20 blobs and 20 doubles per data point. The metrics utility manages this mapping transparently, packing dimensions into blobs and metric values into doubles.
- **No EMF format.** CloudWatch EMF is AWS-specific. Instead, we write directly to AE's `writeDataPoint` API.
- **SQL-queryable output.** Metrics written by this utility are queryable via the AE SQL API, enabling Grafana dashboards, custom analytics, etc.

### Future: Pluggable Backends

The internal interface will be designed around a `MetricsBackend` interface, allowing future adapters for Prometheus push gateway, Datadog, etc. But v1 ships with Analytics Engine only.

---

## Feature 3: Tracer (`@workers-powertools/tracer`)

### Problem

Workers has automatic tracing (beta) that captures fetch calls, binding operations, and handler invocations with zero code changes. However, there are gaps:

- No way to add **custom spans** for application-level operations (e.g., "validate payment", "check inventory")
- No automatic **correlation ID propagation** across service-to-service calls
- No automatic **annotation/metadata enrichment** (user ID, tenant ID on spans)
- Trace context propagation to external services not yet supported

### Key Features

- **Correlation ID management** -- Generate or extract correlation IDs, propagate them on outbound `fetch` calls via W3C `traceparent` / custom headers
- **Request/response enrichment** -- Attach custom attributes to the current trace span (user ID, operation type, etc.)
- **Custom spans** -- Create application-level spans that complement the auto-instrumented ones
- **Error capture** -- Automatically record errors and exceptions as span events
- **Trace ID access** -- Expose the current trace ID for including in error responses to end users

### Approach

```typescript
import { Tracer } from "@workers-powertools/tracer";

const tracer = new Tracer({ serviceName: "payment-api" });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    tracer.addContext(request, ctx);

    // Correlation ID extracted from request or auto-generated
    tracer.setCorrelationId(request.headers.get("X-Request-Id"));

    // Custom span for application logic
    const result = await tracer.captureAsync("processPayment", async () => {
      tracer.putAnnotation("paymentMethod", "credit_card");
      return await chargeCustomer(request);
    });

    // Correlation ID propagated on outbound fetch
    await tracer.captureFetch("https://notifications.example.com/send", {
      method: "POST",
      body: JSON.stringify({ orderId: result.id }),
    });

    return new Response(JSON.stringify(result));
  },
};
```

### Workers-Specific Design Decisions

- **Complements, doesn't replace, auto-tracing.** Workers' built-in tracing handles fetch/binding spans. This utility adds application-level context on top.
- **Lightweight span model.** Since the runtime handles real tracing, our "spans" are primarily structured log events with timing data that correlate to the auto-traced spans via trace ID.
- **Header propagation.** Wraps `fetch` to automatically inject `traceparent`, `X-Correlation-Id`, and `X-Request-Id` headers on outbound requests.
- **No X-Ray SDK dependency.** Lambda Powertools wraps X-Ray SDK. We avoid this entirely -- Workers tracing is built into the runtime.
- **Integration with Logger.** The tracer's correlation ID is automatically available to the Logger, so all logs within a request include the same correlation ID.

### Design Note: Evolving with the Platform

Workers tracing is in beta and evolving rapidly. The tracer utility should be designed to:

1. Degrade gracefully when tracing is not enabled
2. Adopt new platform capabilities (e.g., W3C trace context propagation, span linking) as they become available
3. Not fight the platform -- if Workers adds native custom span support, the utility should become a thin wrapper

---

## Feature 4: Idempotency (`@workers-powertools/idempotency`)

### Problem

Workers handling webhooks (Stripe, GitHub, etc.), queue messages, or any operation with at-least-once delivery need idempotency. Without it, duplicate events cause duplicate charges, duplicate emails, or corrupted data. Implementing idempotency correctly is surprisingly hard: you need atomicity, TTLs, in-progress locks, and proper error handling.

### Key Features

- **Function wrapper** -- `makeIdempotent(fn, options)` wraps any async function to prevent duplicate execution
- **Middleware support** -- Hono middleware and plain handler wrapper
- **Payload subset selection** -- Use a subset of the request (e.g., `body.orderId`) as the idempotency key, not the entire payload
- **Configurable TTL** -- How long to remember previous results (default: 1 hour)
- **In-progress locking** -- Concurrent requests with the same key wait or fail fast
- **Pluggable persistence** -- KV (simple, fast), D1 (SQL, queryable), or Durable Objects (strong consistency)
- **Error handling** -- Failed executions don't create idempotency records (safe to retry)

### Approach

```typescript
import { makeIdempotent, IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

const config = new IdempotencyConfig({
  eventKeyPath: "body.orderId", // JMESPath or simple dot-notation
  expiresAfterSeconds: 3600,
});

const processPayment = makeIdempotent(
  async (event: PaymentEvent): Promise<PaymentResult> => {
    // This only runs once per unique orderId within the TTL
    const result = await chargeCustomer(event);
    return { paymentId: result.id, status: "success" };
  },
  {
    persistenceLayer: new KVPersistenceLayer({ binding: "IDEMPOTENCY_KV" }),
    config,
  },
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const body = await request.json();
    const result = await processPayment({
      body,
      headers: Object.fromEntries(request.headers),
    });
    return new Response(JSON.stringify(result));
  },
};
```

### Persistence Layer Options

| Backend             | Consistency           | Latency      | Best For                                    |
| ------------------- | --------------------- | ------------ | ------------------------------------------- |
| **KV**              | Eventual (with cache) | Low (~ms)    | Most use cases, simple setup                |
| **D1**              | Strong (per-region)   | Medium (~ms) | When you need queryable idempotency records |
| **Durable Objects** | Strong (global)       | Medium       | When you need strict global consistency     |

### Workers-Specific Design Decisions

- **No DynamoDB.** Lambda Powertools uses DynamoDB. Workers equivalents are KV (simple, fast, eventually consistent), D1 (SQLite, strongly consistent per-region), and Durable Objects (globally consistent coordination).
- **KV as default.** KV is the simplest, lowest-latency option. Eventual consistency is acceptable for most idempotency use cases since the TTL window is much larger than the consistency window.
- **Binding-based configuration.** Persistence layers accept Workers bindings (`env.IDEMPOTENCY_KV`), not connection strings.
- **Queue consumer integration.** Works with `queue()` handler for message-level idempotency in Cloudflare Queues.

---

## Package Structure

```
@workers-powertools/
├── logger              # Structured logging
├── metrics             # Custom metrics via Analytics Engine
├── tracer              # Correlation IDs, trace enrichment
├── idempotency         # Exactly-once execution
│   ├── /kv             # KV persistence layer
│   ├── /d1             # D1 persistence layer
│   └── /do             # Durable Objects persistence layer
├── commons             # Shared types, utilities
└── hono                # All Hono middleware adapters in one package
                        # (injectLogger, injectMetrics, injectTracer, injectIdempotency)
```

Each core package is independently installable with no framework dependencies. Framework adapters are grouped by framework — one install per framework regardless of how many utilities are used.

### Why Per-Framework Rather Than Per-Utility

An earlier design had separate adapter packages per utility per framework (`@workers-powertools/logger-hono`, `@workers-powertools/metrics-hono`, etc.). This was replaced with a single package per framework for the following reasons:

- **Install ergonomics.** A Hono user previously needed four separate installs to get all four middleware adapters. With the per-framework model it is one install. As the number of utilities grows, the per-utility model scales poorly.
- **Coherent versioning.** A single `@workers-powertools/hono` package has one version, one changelog, and one peer dependency on `hono`. Per-utility packages would each need to track Hono version compatibility independently, creating a matrix of compatibility combinations to maintain.
- **Discoverability.** Developers searching for "workers powertools hono" find one package. With per-utility packages they would need to know in advance which individual packages exist.
- **Framework-native patterns differ by framework, not by utility.** The middleware API for Hono's logger is shaped by Hono's middleware model (`c.req.raw`, `c.executionCtx`, `createMiddleware`). This is a Hono concern, not a logger concern. Grouping all Hono middleware together makes the framework boundary explicit.
- **Precedent.** This mirrors how established observability libraries structure their framework integrations: `@sentry/hono`, `@opentelemetry/instrumentation-hono`, `@baselime/hono` — one package per framework, not one per feature.

```bash
# Vanilla Worker (no framework)
pnpm add @workers-powertools/logger @workers-powertools/metrics

# Hono
pnpm add @workers-powertools/logger @workers-powertools/metrics @workers-powertools/hono

# Future: Astro
pnpm add @workers-powertools/logger @workers-powertools/astro

# Future: TanStack Start
pnpm add @workers-powertools/logger @workers-powertools/tanstack
```

## Cross-Cutting Concerns

### Configuration

All utilities support configuration via:

1. **Constructor options** (highest priority)
2. **Environment variables** (`POWERTOOLS_SERVICE_NAME`, `POWERTOOLS_LOG_LEVEL`, etc.)
3. **Sensible defaults** (lowest priority)

### `ExecutionContext` Integration

Every utility integrates with `ExecutionContext`:

- Logger: deferred flush via `ctx.waitUntil`
- Metrics: non-blocking write via `ctx.waitUntil`
- Tracer: span lifecycle tied to request lifecycle
- Idempotency: cleanup via `ctx.waitUntil`

### Correlation ID Flow

The Logger and Tracer share correlation IDs so that logs and traces are correlated:

```
Request → Tracer extracts/generates correlation_id
        → Logger automatically includes correlation_id in all logs
        → Tracer propagates correlation_id on outbound fetch calls
        → Downstream Workers can extract and continue the chain
```

### Testing

- Each utility can be instantiated in test mode (`POWERTOOLS_DEV=true`) for local development
- Metrics suppressed in test, or captured for assertion
- Logger output captured for assertion in tests
- Idempotency works with in-memory persistence for testing

## What We Explicitly Won't Build (v1)

### Parameters / Secrets Abstraction

**Lambda equivalent:** `@aws-lambda-powertools/parameters` -- a unified interface over SSM Parameter Store, Secrets Manager, AppConfig, and DynamoDB with caching, transforms, and auto-refresh.

**Why not for Workers:** The problem this solves on AWS is that secrets and config are scattered across 4+ services with different SDKs, IAM policies, and caching semantics. Workers has a fundamentally simpler model: environment variables are declared in `wrangler.jsonc` and injected via the `env` binding. Secrets are set via `wrangler secret put` and accessed the same way. The new Secrets Store adds shared secrets across Workers, but it's still accessed through the same `env` binding pattern.

There's no SDK to initialize, no caching layer to manage, no IAM to configure. A parameters abstraction would be a wrapper around `env.MY_SECRET` -- it would add indirection without solving a real pain point. If Cloudflare's config story becomes more complex (e.g., remote config with versioning, dynamic feature flags), this could be revisited.

### Event Handler / Router

**Lambda equivalent:** `@aws-lambda-powertools/event-handler` -- lightweight routing for API Gateway REST/HTTP, ALB, AppSync, Lambda Function URLs, and Bedrock Agents.

**Why not for Workers:** This exists because Lambda's raw event format is a JSON blob that varies by trigger source. API Gateway v1 events look nothing like v2, which look nothing like ALB events. Lambda Powertools normalizes these into a consistent routing model.

Workers don't have this problem. The handler receives a standard `Request` object regardless of trigger. The routing ecosystem is mature and well-adopted: Hono (dominant, full-featured), itty-router (minimal), and others. Building another router would fragment the ecosystem without adding value. Our framework adapter packages (e.g., `@workers-powertools/hono`) are the right integration point instead.

### Batch Processing

**Lambda equivalent:** `@aws-lambda-powertools/batch` -- handles partial failures when processing batches from SQS, Kinesis, and DynamoDB Streams.

**Why not for Workers (v1):** Lambda's batch processing is complex because SQS/Kinesis deliver batches of records and the failure semantics differ per source (SQS supports partial batch failure reporting, Kinesis uses checkpointing). Getting this wrong means either losing messages or reprocessing entire batches.

Cloudflare Queues has a simpler model: each `queue()` invocation receives a batch of messages, and you call `message.ack()` or `message.retry()` individually. The per-message control is already built in, so there's less framework-level orchestration needed. That said, common patterns like "process all messages, collect failures, ack successes" are still boilerplate that developers repeat. If Queues adoption grows and more complex patterns emerge (dead-letter handling, partial batch retry strategies), a batch utility becomes worthwhile.

### Parser / Request Validation

**Lambda equivalent:** `@aws-lambda-powertools/parser` -- Zod-based schema validation for Lambda event payloads with built-in schemas for API Gateway, SQS, SNS, EventBridge, etc.

**Why not for Workers (v1):** There are two components to this: the validation library itself (Zod) and the pre-built schemas for event sources.

Zod v4 is already the de facto standard in the TypeScript ecosystem and works perfectly in Workers. A thin wrapper that just re-exports Zod with a few helpers would add a dependency without meaningful value. The pre-built schemas for Lambda event sources (API Gateway, SQS, etc.) are the real value of the Lambda parser -- they save you from writing schemas for AWS's complex event formats. Workers receive standard `Request` objects, so there's no equivalent "event shape" problem to solve.

If we find that developers are repeatedly writing Zod schemas for common Cloudflare-specific payloads (Queue message shapes, Durable Object alarm payloads, Email Worker events), pre-built schemas could be valuable in a future version.

### JMESPath Functions

**Lambda equivalent:** `@aws-lambda-powertools/jmespath` -- JMESPath query functions for extracting and transforming deeply nested event payloads.

**Why not for Workers:** JMESPath is useful in Lambda because event payloads from AWS services are deeply nested JSON (e.g., extracting a body from an API Gateway event that's base64-encoded inside a wrapper). Workers receive flat `Request` objects. TypeScript's type system plus standard destructuring handles the extraction patterns that JMESPath solves. Adding a JMESPath runtime dependency for niche use cases would violate the "keep it lean" tenet.

### OpenTelemetry SDK / Full Tracing Instrumentation

**Why not for Workers (v1):** Workers now has built-in automatic tracing that instruments fetch calls, binding operations, and handler invocations with zero code changes. The traces are exportable to any OTLP-compatible destination (Honeycomb, Grafana, Sentry). Bundling the full OTel SDK would add significant bundle size (~100KB+), duplicate what the runtime already provides, and fight the platform's direction. Our Tracer utility is deliberately a thin enrichment layer (correlation IDs, custom annotations, span context) that complements the built-in tracing rather than replacing it.

### Rate Limiting / Throttling

**Why not for Workers:** Cloudflare provides rate limiting at the network edge via Rate Limiting Rules and the `cf.botManagement` properties. Implementing application-level rate limiting in a Worker requires shared state (which Workers don't have natively without Durable Objects or KV). This is fundamentally an infrastructure concern better handled at the Cloudflare edge, not in application code. If someone needs application-level rate limiting, Durable Objects are the right primitive and the pattern is well-documented.

### Error Handling / Circuit Breaker

**Why not for Workers (v1):** Circuit breaker patterns require shared state across requests to track failure counts and circuit state. In Lambda, this can be approximated with in-process state since containers are reused. Workers isolates have a different lifecycle model -- state doesn't persist reliably between requests without external storage. A circuit breaker backed by KV or Durable Objects is feasible but adds latency on every call to check circuit state. This is a pattern that's better implemented at the service mesh / gateway level or with Durable Objects directly when truly needed.

### Streaming / Large Object Processing

**Lambda equivalent (Python only):** `streaming` utility -- streams S3 objects with a file-like interface, built-in transforms for gzip, CSV, and ZIP, minimal memory consumption.

**Why not for Workers:** This exists in Lambda Python because Lambda has a configurable memory ceiling (128MB-10GB) and S3 objects can easily exceed it. Workers have a 128MB memory limit, so the problem is real for R2 objects too. However, Workers already have native streaming via the Streams API (`ReadableStream`, `TransformStream`), and R2's `get()` returns a `ReadableStream` by default. The platform primitives are already streaming-first, unlike Lambda where you get the full payload in memory by default. A utility for composing transform pipelines (decompress -> parse CSV -> filter rows) over R2 streams could be useful but is a niche use case. If demand emerges, it fits better as a standalone utility than as part of this toolkit.

### Middleware Factory

**Lambda equivalent (Python only):** `middleware_factory` -- a decorator factory to create custom before/after middleware with built-in tracing support.

**Why not for Workers:** This exists in Lambda Python because Python's decorator pattern for Lambda handlers is idiomatic but repetitive to implement correctly (handling context, return values, error propagation). In the Workers/TypeScript ecosystem, this is already well-served by:

- Hono's middleware system (the dominant choice)
- Standard function composition patterns in TypeScript
- The `onRequest` middleware pattern in itty-router

Building a middleware factory would overlap with established patterns without adding meaningful value. Our framework adapter packages (e.g., `@workers-powertools/hono`) are the right integration point for providing middleware functionality.

---

## Future Extensions (v2+)

The following features are not in scope for v1 but are strong candidates for future versions based on ecosystem maturity and community demand.

### Batch Processing Utility (`@workers-powertools/batch`)

**Trigger:** Growing Queues adoption, demand for standardized dead-letter queue handling.

**What it would do:** Provide a `processBatch()` wrapper for `queue()` handlers that standardizes per-message error handling, automatic retry/ack orchestration, dead-letter routing, and partial failure reporting. Could also cover batch patterns for R2 event notifications and D1 change streams if those emerge.

```typescript
// Potential API sketch
import { processBatch } from "@workers-powertools/batch";

export default {
  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
    await processBatch(batch, {
      handler: async (message) => {
        // process individual message; thrown errors auto-retry
        await handleMessage(message.body);
      },
      maxRetries: 3,
      deadLetterQueue: env.DLQ, // Queue binding
    });
  },
};
```

### Request Validation Schemas (`@workers-powertools/schemas`)

**Trigger:** Community demand for pre-built Zod schemas for Cloudflare-specific payloads.

**What it would do:** Ship Zod v4 schemas for common Cloudflare event shapes: Queue message envelopes, Email Worker events, Durable Object alarm payloads, Cron trigger events, Tail Worker event formats, and R2 event notification payloads. Not a Zod wrapper -- just the schemas.

### Feature Flags (`@workers-powertools/feature-flags`)

_Inspired by: Python Powertools `feature_flags` utility (not available in TypeScript version)_

**Trigger:** Demand for dynamic feature rollouts without redeployment.

**What it would do:** Provide a rule engine for evaluating feature flags with conditional rules (equality, time-based windows, percentage rollouts via modulo range). Backed by KV or D1 as the config store (replacing Python's AppConfig dependency). Features include:

- **Static flags** -- Simple on/off toggles read from a JSON config blob in KV
- **Dynamic flags** -- Rule-based evaluation against request context (user tier, geo, headers)
- **Time-based flags** -- Enable features during specific time windows, days of week, or date ranges
- **Percentage rollouts** -- Modulo-range conditions for gradual rollout (e.g., enable for 10% of users based on user ID hash)
- **Non-boolean flags** -- Return arbitrary JSON values (feature lists, config objects) not just booleans
- **In-memory caching** -- Cache config for N seconds to avoid KV reads on every request
- **Pluggable store** -- Default KV store, with an interface for D1, HTTP endpoints, or custom providers
- **Logger integration** -- Automatically append active feature flag state to log context

```typescript
// Potential API sketch
import { FeatureFlags, KVStore } from "@workers-powertools/feature-flags";

const store = new KVStore({ binding: "FEATURE_FLAGS" });
const flags = new FeatureFlags({ store, maxAge: 30 }); // cache for 30s

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    flags.setBinding(env.FEATURE_FLAGS);

    const context = {
      tier: request.headers.get("X-User-Tier") ?? "free",
      country: request.cf?.country ?? "US",
    };

    const hasPremium = flags.evaluate("premium_features", { context, default: false });
    const discountPct = flags.evaluate("holiday_discount", { context, default: 0 });

    // ...
  },
};
```

**Why not v1:** Feature flags add meaningful complexity (rule engine, config schema, store provider abstraction) and are useful but not foundational the way logging and metrics are. Better to ship core observability first and add this once the project has traction.

### Data Masking (`@workers-powertools/data-masking`)

_Inspired by: Python Powertools `data_masking` utility (not available in TypeScript version)_

**Trigger:** Growing regulatory requirements (GDPR, PCI-DSS) and demand for PII handling in logs and API responses.

**What it would do:** Provide utilities to erase, mask, or encrypt sensitive fields in structured data before logging or returning in responses. Three modes of operation:

- **Erase** -- Irreversibly replace fields with `*****` (or custom mask). Supports dot-notation field paths, array wildcards, and conditional expressions. Zero dependencies.
- **Mask** -- Partially redact fields while preserving structure (e.g., `j****@example.com`, `****-****-****-4242`). Supports dynamic masking (preserve length), custom masks, and regex patterns.
- **Encrypt/Decrypt** -- Encrypt sensitive fields using Web Crypto API (AES-GCM). Workers have native access to the Web Crypto API, so no external encryption SDK is needed (unlike Python's AWS KMS dependency). Encryption keys stored as Worker secrets.

```typescript
// Potential API sketch
import { DataMasking } from "@workers-powertools/data-masking";

const masker = new DataMasking();

// Erase specific fields
const erased = masker.erase(userData, {
  fields: ["email", "address.street", "payment.card_number"],
});

// Mask with patterns
const masked = masker.erase(userData, {
  maskingRules: {
    email: { regexPattern: "(.)(.*)(@.*)", maskFormat: "$1****$3" },
    "payment.card_number": { customMask: "****-****-****-####" }, // preserve last 4
  },
});

// Integrate with Logger -- auto-mask before logging
logger.info("User action", masker.erase(sensitivePayload, { fields: ["ssn", "dob"] }));
```

**Workers-specific considerations:**

- **Web Crypto API** for encryption instead of AWS KMS + Encryption SDK. This is a major simplification -- no external service calls, no IAM, no added latency.
- **Logger integration** -- Optional integration to automatically mask fields before they hit `console.log`, preventing accidental PII leaks in Workers Logs.
- **Zero dependencies** for erase/mask operations; Web Crypto is built into the Workers runtime for encrypt/decrypt.

**Why not v1:** Erase/mask functionality is relatively simple to implement but requires careful API design for field selection syntax. Encrypt/decrypt adds crypto key management complexity. Valuable but not a day-one need for most Workers developers.

### Event Source Data Classes (`@workers-powertools/events`)

_Inspired by: Python Powertools `data_classes` utility (not available in TypeScript version)_

**Trigger:** Growing number of Worker trigger types and demand for typed event handling.

**What it would do:** Provide strongly-typed TypeScript classes for Cloudflare-specific event payloads with self-documenting properties, helper methods, and IDE autocomplete. Covers:

- **Queue messages** -- Typed `QueueMessage<T>` with deserialization helpers, retry metadata access
- **Cron triggers** -- Typed `ScheduledEvent` with cron expression, scheduled time
- **Email Workers** -- Typed `EmailEvent` with parsed headers, from/to, body stream access
- **Durable Object alarms** -- Typed alarm event context
- **R2 event notifications** -- Typed `R2Event` with bucket, key, action, metadata
- **Tail Worker events** -- Typed `TailEvent` with producer info, logs, exceptions, outcome
- **Service binding requests** -- Request context enrichment for inter-Worker RPC

```typescript
// Potential API sketch
import { QueueEvent } from "@workers-powertools/events";
import type { OrderPayload } from "./types";

export default {
  async queue(batch: QueueEvent<OrderPayload>, env: Env, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      // Typed access to body, metadata, retry count
      const order = message.body; // typed as OrderPayload
      const retryCount = message.attempts;
      const enqueuedAt = message.timestamp;

      await processOrder(order);
      message.ack();
    }
  },
};
```

**Why not v1:** Workers already uses standard Web APIs (`Request`, `Response`) for the primary `fetch` handler, so the typing story is already good for HTTP. The value increases as more non-HTTP trigger types (Queues, Email, R2 events) gain adoption. This package has low risk and could be promoted to v1 if demand emerges during development.

### Pluggable Metrics Backends (`@workers-powertools/metrics-prometheus`, etc.)

**Trigger:** Demand for exporting metrics to non-Cloudflare observability platforms.

**What it would do:** Implement the `MetricsBackend` interface (designed in v1 but only implemented for Analytics Engine) for Prometheus push gateway, Datadog, New Relic, and OpenTelemetry metrics. Each backend would be a separate package. The flush mechanism would use `ctx.waitUntil` to push metrics to external endpoints without blocking the response.

### Middleware Adapters for Other Frameworks

**Trigger:** Adoption of frameworks beyond Hono in the Workers ecosystem.

**What it would do:** Ship middleware packages for itty-router, Elysia, or whatever frameworks gain traction. The framework-agnostic core design means these are thin integration layers, not re-implementations.

### Durable Objects Integration Utilities (`@workers-powertools/do`)

**Trigger:** Maturity of v1 core utilities + growing DO adoption.

**What it would do:** Extend Logger, Metrics, and Tracer with Durable Objects-specific context enrichment: DO name/ID in logs, per-DO metrics, alarm lifecycle tracing, and WebSocket session correlation. Could also provide patterns for DO-based distributed locks and leader election that complement the Idempotency utility.

### Workflow Observability (`@workers-powertools/workflows`)

**Trigger:** Cloudflare Workflows reaching GA and wider adoption.

**What it would do:** Provide step-level logging, metrics, and tracing for Workflows. Each workflow step would automatically get structured log context (workflow ID, step name, attempt number), step-level duration metrics, and correlation across the full workflow execution.

### Security Utilities (`@workers-powertools/security`)

**Trigger:** Community demand for standardized security patterns.

**What it would do:** Provide utilities for common security tasks: request signing/verification (HMAC, JWT validation), webhook signature verification (pre-built for Stripe, GitHub, Slack, etc.), and input sanitization helpers. Webhook verification in particular is highly repetitive boilerplate that every Workers developer writes.

## Wide Events, Canonical Log Lines, and Sub-Spans

> See the [References](#references) section for full citations and key contributions from each work.

### Guiding Philosophy

This project aims to **balance visibility and queryability** — not to pick a side in the wide events vs. sub-spans debate, but to provide the primitives that let developers get both.

**Visibility** means being able to answer "what is this system doing right now?" — which requires individual log entries per meaningful operation, correlation IDs that link events across a request, and sub-span timing detail that shows order of execution.

**Queryability** means being able to answer "what pattern of behaviour is happening across all requests?" — which requires high-cardinality structured fields colocated in a single event per request, suitable for OLAP-style queries (count by user tier, p95 duration by route, errors by feature flag).

The tension: sub-spans optimise for visibility on individual requests; wide events optimise for queryability across all requests. The references in this section collectively argue that you should not have to choose. The toolkit's role is to make both achievable without doubling the instrumentation effort.

### The Core Tension

There are three distinct but related observability philosophies at play here, and understanding how they differ directly shapes how we design the Logger and Tracer.

**Canonical Log Lines (Leach / Stripe):** One long, information-dense structured log entry emitted _once_ per request per service. All relevant context — HTTP metadata, user info, rate limit state, timing, outcome — is colocated in a single line. The goal is ergonomics: fast to write queries, fast to execute, no need to JOIN across log lines. Already proven at scale: Stripe emits a canonical log line for every API request, webhook, tokenization, and dashboard page load. Leach notes that canonical lines are also archived to a data warehouse (via Kafka → S3 → Redshift) and used to power user-facing analytics in the Stripe Developer Dashboard.

**Wide Events (Tane, Morrell, Majors):** A superset of canonical log lines. One event per unit of work, enriched far beyond HTTP metadata — business context, user tier, feature flags, system metrics, span summaries, error slugs. The mental model shift: _log what happened to this request_, not _what your code is doing_. Designed for high-cardinality OLAP backends (Honeycomb, ClickHouse, ClickHouse-backed tools like Baselime/SigNoz) rather than text search. Morrell documents ~100 specific fields across a dozen categories; Tane shows that 1M sampled events stored in columnar format (Parquet/DuckDB) costs ~$0.07/month on R2. Both emphasise that the data is structured for machines to query, not humans to read line-by-line.

**Wide Events + Sub-Spans (Petrou / Cloudflare):** Agrees with both of the above, but argues that a single wide event per service is _insufficient_ for operations that repeat within a request (retries, batch loops, lock contention). Flat key-value structures cannot capture "this lock was contested 4 times with these individual durations in this order" without inventing messy naming conventions. Sub-spans preserve ordering, individual timings, and occurrence count in a way that flat structures fundamentally cannot. The position: you want both — the queryability of wide events AND the precision of sub-spans — and the platform (not the user) should bear the cost of merging them into a "mega wide event" per service entrypoint.

### How Our Current Approach Compares

The Logger utility as currently designed is closest to the **Canonical Log Line** model: structured JSON, per-log-call, with `persistentKeys` providing colocated context. This is already a significant improvement over `console.log("something happened")`.

However it falls short of the wide events philosophy in two ways:

1. **Multiple log calls per request.** Our Logger emits one JSON entry per `logger.info()` call. The wide events model calls for one authoritative entry per request, with all context accumulated throughout the request lifecycle and emitted once at the end. Multiple log lines per request require the query engine to correlate them — exactly the problem wide events solve.

2. **No root event accumulation.** When `captureAsync` completes, its timing data disappears into a separate log entry. There is no mechanism to fold sub-span results back into a root event that captures the full picture of the request.

### Design Additions to Tracer and Logger

The following additions would bring the toolkit into alignment with the wide events + sub-spans philosophy.

#### 1. Canonical Wide Event (root accumulator)

Add a `WideEvent` concept to the Logger — a mutable accumulator that is populated throughout the request lifecycle and emitted once at the end via `ctx.waitUntil`. Individual `logger.info()` calls continue to work for debugging, but the wide event is the authoritative record.

```typescript
// The middleware initialises the wide event at request start
const logger = new Logger({
  serviceName: "payment-api",
  wideEvents: true, // enable wide event accumulation
  emitIntermediateLogs: true, // also emit per-call logs (for debugging)
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    logger.addContext(request, ctx);

    // Any call to logger.info / logger.warn / logger.error
    // also contributes fields to the root wide event
    logger.info("Processing payment", { orderId: "ord_123" });

    // Business context added mid-request flows into the wide event
    logger.appendWideEventFields({
      user: { id: "usr_456", tier: "enterprise" },
      featureFlags: { newCheckoutFlow: true },
    });

    try {
      const result = await processPayment(request);
      logger.appendWideEventFields({ outcome: "success", paymentId: result.id });
      return Response.json(result);
    } catch (error) {
      logger.error("Payment failed", error as Error);
      return new Response("Internal Error", { status: 500 });
    } finally {
      // Emit the single wide event for this request
      ctx.waitUntil(logger.flushWideEvent());
    }
  },
};
```

**Output — one wide event per request:**

```json
{
  "level": "INFO",
  "message": "canonical",
  "timestamp": "2026-04-08T12:00:00.000Z",
  "service": "payment-api",
  "correlation_id": "abc-123",
  "colo": "SJC",
  "method": "POST",
  "path": "/payments",
  "status": 200,
  "duration_ms": 142,
  "orderId": "ord_123",
  "outcome": "success",
  "paymentId": "pay_789",
  "user": { "id": "usr_456", "tier": "enterprise" },
  "featureFlags": { "newCheckoutFlow": true },
  "spans": {
    "validateInput": { "duration_ms": 2 },
    "chargeCustomer": { "duration_ms": 138, "attempts": 1 }
  }
}
```

#### 2. Sub-Span Rollup onto the Wide Event

When `captureAsync` completes, its timing, annotations, and outcome are folded back into the root wide event under a `spans` key. Sub-spans still emit their own detailed log entries for waterfall visibility, but the wide event carries a summary of every span that ran during the request.

This directly addresses Lambros's "multiple occurrences" problem: repeated operations (retries, lock attempts) are captured as an array under their span name:

```json
"spans": {
  "acquireLock": [
    { "attempt": 1, "duration_ms": 3, "success": false },
    { "attempt": 2, "duration_ms": 7, "success": true }
  ],
  "queryDB": { "duration_ms": 12, "success": true }
}
```

This allows querying the wide event for `spans.acquireLock[*].duration_ms` without needing cross-span query engine support.

#### 3. Jeremy Morrell's "Main Span" Pattern

Jeremy Morrell's guide identifies a critical problem: in OTel, calling `getActiveSpan()` inside a child span returns the child, not the root. He works around this by saving the root span reference in context. We face the same problem with `appendWideEventFields` — it must always target the root event regardless of how deeply nested the call is within `captureAsync` chains.

The solution is to store the `WideEvent` accumulator on an isolate-scoped `AsyncLocalStorage`-equivalent. Workers does not yet have `AsyncLocalStorage`, but the same effect can be achieved by passing the wide event reference down through `captureAsync` via the `span` argument:

```typescript
await tracer.captureAsync("outerOp", async (span) => {
  // span.root always refers to the request-level wide event
  span.root.appendFields({ outerOpStarted: true });

  await tracer.captureAsync("innerOp", async (innerSpan) => {
    // innerSpan.root is the same root reference
    innerSpan.root.appendFields({ innerOpCompleted: true });
  });
});
```

#### 4. Tail Sampling Integration

Boris Tane and Jeremy Morrell both emphasise tail sampling: the sampling decision should be made _after_ the request completes, based on outcome. The wide event is the natural place to apply this because it has full outcome information (status, error, duration, user tier) at flush time.

```typescript
const logger = new Logger({
  wideEvents: true,
  sampling: {
    // Always emit wide events for errors and slow requests
    alwaysInclude: (event) =>
      event.status >= 500 ||
      event.duration_ms > 2000 ||
      event.user?.tier === "enterprise",
    // Sample 5% of successful fast requests
    rate: 0.05,
  },
});
```

This is distinct from `wrangler`'s `head_sampling_rate` (which decides whether to log a request _at all_, before it runs) and from the existing `debugSampleRate` (which elevates log level mid-request). Tail sampling decides whether to _emit the wide event_ based on what actually happened.

### Comparison Summary

| Concern                 | loggingsucks.com                            | Jeremy Morrell                               | Lambros Petrou                                     | Our Approach                                         |
| ----------------------- | ------------------------------------------- | -------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| **Primary artifact**    | One wide event per request                  | One main span per request                    | Both wide events + sub-spans                       | Wide event + sub-span detail logs                    |
| **Sub-spans**           | Capture timing as flat fields on wide event | Child spans, but keep summaries on main span | Full sub-spans, don't flatten                      | `captureAsync` emits detail + rolls up to wide event |
| **Repeated operations** | Not addressed                               | Stats rollup on main span                    | Explicitly needs sub-spans                         | Array of occurrences under span name in wide event   |
| **Sampling**            | Tail sampling based on outcome              | Per-span sample rate                         | Not addressed                                      | Tail sampling on wide event flush                    |
| **Workers fit**         | High — no `process` needed, pure JSON       | High                                         | High, but cross-span queries need platform support | High — complements Workers auto-tracing              |

### Querying Wide Events in Workers

The canonical wide event emitted by the Logger maps directly to the Workers observability stack:

- **Workers Logs** — the wide event is the single JSON log line per request, queryable by `correlation_id`, `service`, `outcome`, `user.tier`, `spans.*`, etc. via the dashboard and GraphQL API
- **LogPush to R2** — emit to R2 (as Boris's cost analysis shows, 1M sampled events ≈ $0.07/month) and query with DuckDB or Cloudflare D1 for longer-term analytics
- **LogPush to third-party** — push to Honeycomb (best wide event query UX), Datadog (cross-span Trace Queries), or Grafana (Tempo TraceQL structural queries)
- **Analytics Engine** — custom metrics derived from wide event fields (request count, p95 duration, error rate per user tier) queryable via SQL API

### Implementation Phasing

Given the complexity, this is a v2 feature set built on top of the v1 Logger and Tracer foundations:

- **v1:** Structured logging per call, sub-spans as detail log entries, correlation IDs
- **v2:** `wideEvents: true` mode, `appendWideEventFields()`, span rollup onto root event, array-of-occurrences for repeated spans, tail sampling

This phasing means v1 is already useful and ships quickly, while v2 adds the more sophisticated observability patterns once the community has validated the core API.

## Open Questions

1. **Naming:** `@workers-powertools/*` vs `@cf-powertools/*` vs `workers-powertools` vs something else entirely?
2. **Monorepo tooling:** Turborepo + pnpm workspaces? nx?
3. **Minimum Workers runtime version:** Should we require the latest compatibility date, or support older dates?
4. **Analytics Engine dataset management:** One dataset per metric namespace, or one shared dataset with namespace as a dimension?
5. **Tracer scope:** How deeply should we integrate with Workers' built-in tracing vs. building our own span model? This depends heavily on how the beta evolves.

## Next Steps

1. Validate this proposal and gather feedback
2. Scaffold the monorepo with build tooling, TypeScript strict mode, Vitest
3. Implement Logger first (highest standalone value, simplest to ship)
4. Implement Metrics second (depends on AE binding availability)
5. Implement Tracer third (depends on platform tracing evolution)
6. Implement Idempotency fourth (most complex, benefits from patterns established in 1-3)
7. Add Hono middleware packages after core utilities are stable
