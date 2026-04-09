# Workers Powertools

A developer toolkit for observability and reliability best practices for Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

## Packages

### Core

| Package                                                     | Description                                                                                                             | npm                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [`@workers-powertools/logger`](./packages/logger)           | Structured JSON logging with Workers context enrichment, correlation IDs, log levels, debug sampling, and log buffering | `npm i @workers-powertools/logger`      |
| [`@workers-powertools/metrics`](./packages/metrics)         | Custom application-level metrics via Analytics Engine with named metrics, dimensions, and non-blocking flush            | `npm i @workers-powertools/metrics`     |
| [`@workers-powertools/tracer`](./packages/tracer)           | Request correlation and trace enrichment that complements Workers' built-in automatic tracing                           | `npm i @workers-powertools/tracer`      |
| [`@workers-powertools/idempotency`](./packages/idempotency) | Exactly-once execution with pluggable persistence (KV, D1) for webhooks, queue consumers, and payment flows             | `npm i @workers-powertools/idempotency` |
| [`@workers-powertools/commons`](./packages/commons)         | Shared types, utilities, and base classes used by all packages                                                          | `npm i @workers-powertools/commons`     |

### Framework Adapters

| Package                                       | Description                                                                                          | npm                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------- |
| [`@workers-powertools/hono`](./packages/hono) | Hono middleware for logger, metrics, tracer, and idempotency — one package for all Hono integrations | `npm i @workers-powertools/hono` |

## Quick Start

### Logger

```typescript
import { Logger } from "@workers-powertools/logger";

const logger = new Logger({
  serviceName: "payment-api",
  logLevel: "INFO",
  persistentKeys: { environment: "production" },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    logger.addContext(request, ctx);

    logger.info("Processing request", { path: new URL(request.url).pathname });

    try {
      const result = await handleRequest(request);
      logger.info("Request succeeded");
      return new Response(JSON.stringify(result));
    } catch (error) {
      logger.error("Request failed", error as Error);
      return new Response("Internal Error", { status: 500 });
    }
  },
};
```

Output:

```json
{
  "level": "INFO",
  "message": "Processing request",
  "timestamp": "2026-04-08T12:00:00.000Z",
  "service": "payment-api",
  "environment": "production",
  "correlation_id": "abc-123-def",
  "colo": "SJC",
  "country": "US",
  "path": "/orders"
}
```

### Metrics

```typescript
import { Metrics, MetricUnit } from "@workers-powertools/metrics";

const metrics = new Metrics({
  namespace: "ecommerce",
  serviceName: "orders",
  defaultDimensions: { environment: "production" },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    metrics.setBinding(env.ANALYTICS);
    metrics.addDimension("endpoint", "/orders");

    const start = Date.now();
    const result = await processOrder(request);

    metrics.addMetric("orderLatency", MetricUnit.Milliseconds, Date.now() - start);
    metrics.addMetric("orderValue", MetricUnit.None, result.total);

    ctx.waitUntil(metrics.flush());
    return new Response(JSON.stringify(result));
  },
};
```

### Tracer

```typescript
import { Tracer } from "@workers-powertools/tracer";

const tracer = new Tracer({ serviceName: "payment-api" });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    tracer.addContext(request, ctx);

    const result = await tracer.captureAsync("processPayment", async (span) => {
      span.annotations["paymentMethod"] = "credit_card";
      return await chargeCustomer(request);
    });

    // Correlation ID is automatically propagated
    await tracer.captureFetch("https://notifications.example.com/send", {
      method: "POST",
      body: JSON.stringify({ orderId: result.id }),
    });

    return new Response(JSON.stringify(result));
  },
};
```

### Idempotency

```typescript
import { makeIdempotent, IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

// KVPersistenceLayer is initialised lazily — env bindings are only
// available inside the fetch handler, not at module scope.
let persistenceLayer: KVPersistenceLayer | undefined;

const config = new IdempotencyConfig({
  eventKeyPath: "orderId",
  expiresAfterSeconds: 3600,
});

const processPayment = makeIdempotent(
  async (event: { orderId: string; amount: number }) => {
    const result = await chargeCustomer(event);
    return { paymentId: result.id, status: "success" };
  },
  {
    get persistenceLayer() {
      if (!persistenceLayer) throw new Error("persistenceLayer not initialised");
      return persistenceLayer;
    },
    config,
  },
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Initialise once per isolate on first request.
    persistenceLayer ??= new KVPersistenceLayer({ binding: env.IDEMPOTENCY_KV });

    const event = (await request.json()) as { orderId: string; amount: number };
    const result = await processPayment(event);
    return Response.json(result);
  },
};
```

### With Hono

```typescript
import { Hono } from "hono";
import { Logger } from "@workers-powertools/logger";
import { Metrics, MetricUnit } from "@workers-powertools/metrics";
import { Tracer } from "@workers-powertools/tracer";
import {
  injectLogger,
  injectMetrics,
  injectTracer,
  injectIdempotency,
} from "@workers-powertools/hono";
import { IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

const logger = new Logger({ serviceName: "my-api" });
const metrics = new Metrics({ namespace: "my-api", serviceName: "my-api" });
const tracer = new Tracer({ serviceName: "my-api" });

// Lazily initialised on first request (env bindings unavailable at module scope).
let persistenceLayer: KVPersistenceLayer | undefined;
const idempotencyConfig = new IdempotencyConfig({
  eventKeyPath: "$",
  expiresAfterSeconds: 3600,
});

const app = new Hono<{ Bindings: Env }>();

// Global middleware — applied to every route.
app.use(injectLogger(logger));
app.use(injectMetrics(metrics));
app.use(injectTracer(tracer));

app.get("/hello", (c) => {
  logger.info("Hello endpoint hit");
  return c.json({ message: "hello" });
});

// Idempotency is applied per-route, not globally, since only
// state-mutating endpoints need it. The thin wrapper initialises
// the persistence layer from c.env on the first request.
app.post(
  "/orders",
  async (c, next) => {
    persistenceLayer ??= new KVPersistenceLayer({ binding: c.env.IDEMPOTENCY_KV });
    return injectIdempotency({ persistenceLayer, config: idempotencyConfig })(c, next);
  },
  async (c) => {
    const body = await c.req.json<{ orderId: string }>();
    // Handler only runs once per unique Idempotency-Key header value.
    return c.json({ orderId: body.orderId, status: "created" }, 201);
  },
);

export default app;
```

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 10

### Setup

```bash
pnpm install
```

### Commands

```bash
pnpm build        # Build all packages (via Turborepo)
pnpm test         # Run tests across all packages
pnpm lint         # Lint all packages
pnpm format       # Format source files with Prettier
pnpm format:check # Check formatting without writing
pnpm typecheck    # Run TypeScript type checking
pnpm clean        # Remove all build artifacts
```

### Project Structure

```
workers-powertools/
├── packages/
│   ├── commons/           # Shared types, correlation ID, CF properties
│   ├── logger/            # Structured logging
│   ├── metrics/           # Analytics Engine metrics
│   ├── tracer/            # Trace enrichment & correlation
│   ├── idempotency/       # Exactly-once execution
│   └── hono/              # Hono middleware adapters (logger, metrics, tracer, idempotency)
├── examples/
│   ├── vanilla-worker/    # Plain Workers example (no framework)
│   └── hono-worker/       # Hono example with middleware adapters
├── turbo.json             # Turborepo task config
├── pnpm-workspace.yaml    # pnpm workspace definition
├── tsconfig.base.json     # Shared TypeScript config
├── eslint.config.mjs      # ESLint flat config
└── vitest.workspace.ts    # Vitest workspace config
```

### Adding a Changeset

When making changes that should result in a version bump:

```bash
pnpm changeset
```

Follow the prompts to describe the change and select affected packages.

## License

MIT
