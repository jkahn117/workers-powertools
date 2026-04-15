# @workers-powertools/hono

Hono middleware adapters for all Workers Powertools utilities. A single package for integrating logger, metrics, tracer, and idempotency into your Hono application.

Part of [Workers Powertools](../../README.md) — a developer toolkit for observability and reliability best practices on Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

> **Framework adapters** — this is the Hono adapter. More framework adapters (Astro, etc.) may be added in the future. The core packages (`logger`, `metrics`, `tracer`, `idempotency`) are framework-agnostic and can be used directly in any Workers project.

## Installation

```bash
pnpm add @workers-powertools/hono
```

## Middleware

### `injectLogger(logger)`

Enriches the logger with request context (CF properties, correlation ID) before the handler runs, and clears temporary keys afterward.

```typescript
import { injectLogger } from "@workers-powertools/hono";

app.use(injectLogger(logger));
```

### `injectMetrics(metrics, options?)`

Records `request_duration` and `request_count` metrics with `route`, `method`, and `status` dimensions, then flushes via `ctx.waitUntil()`.

```typescript
import { injectMetrics } from "@workers-powertools/hono";
import { PipelinesBackend } from "@workers-powertools/metrics";

// Default — uses env.METRICS_PIPELINE automatically
app.use(injectMetrics(metrics));

// Custom binding name
app.use(
  injectMetrics(metrics, {
    backendFactory: (env) =>
      new PipelinesBackend({ binding: env.MY_PIPELINE as PipelineBinding }),
  }),
);
```

The backend is only created once per binding reference — `setBackend()` is idempotent when the underlying binding hasn't changed.

### `injectTracer(tracer)`

Extracts correlation ID, wraps the handler in a route-level span (`METHOD /path`), and annotates it with `http.method`, `http.route`, `http.url`, and `http.status`.

```typescript
import { injectTracer } from "@workers-powertools/hono";

app.use(injectTracer(tracer));
```

### `injectIdempotency(options)`

Checks idempotency before the handler runs. If a completed record exists, returns the stored response. Concurrent duplicates receive 409 Conflict.

Apply per-route to state-mutating endpoints only:

```typescript
import { injectIdempotency } from "@workers-powertools/hono";

app.post(
  "/orders",
  async (c, next) => {
    persistenceLayer ??= new KVPersistenceLayer({ binding: c.env.IDEMPOTENCY_KV });
    return injectIdempotency({ persistenceLayer, config: idempotencyConfig })(c, next);
  },
  async (c) => {
    const body = await c.req.json();
    return c.json({ orderId: body.orderId, status: "created" }, 201);
  },
);
```

## Full Example

```typescript
import { Hono } from "hono";
import { Logger } from "@workers-powertools/logger";
import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";
import type { PipelineBinding } from "@workers-powertools/metrics";
import { Tracer } from "@workers-powertools/tracer";
import {
  injectLogger,
  injectMetrics,
  injectTracer,
  injectIdempotency,
} from "@workers-powertools/hono";
import { IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

const logger = new Logger();
const metrics = new Metrics();
const tracer = new Tracer();

let persistenceLayer: KVPersistenceLayer | undefined;
const idempotencyConfig = new IdempotencyConfig({
  eventKeyPath: "$",
  expiresAfterSeconds: 3600,
});

const app = new Hono<{ Bindings: Env }>();

app.use(injectLogger(logger));
app.use(injectTracer(tracer));
app.use(
  injectMetrics(metrics, {
    backendFactory: (env) =>
      new PipelinesBackend({ binding: env.METRICS_PIPELINE as PipelineBinding }),
  }),
);

app.get("/hello", (c) => c.json({ message: "hello" }));

app.post(
  "/orders",
  async (c, next) => {
    persistenceLayer ??= new KVPersistenceLayer({ binding: c.env.IDEMPOTENCY_KV });
    return injectIdempotency({ persistenceLayer, config: idempotencyConfig })(c, next);
  },
  async (c) => {
    const body = await c.req.json();
    return c.json({ status: "created" }, 201);
  },
);

export default app;
```
