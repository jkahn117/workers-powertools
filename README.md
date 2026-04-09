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

#### Basic usage — Workers fetch handler

```typescript
import { Logger } from "@workers-powertools/logger";

const logger = new Logger({
  serviceName: "payment-api",
  logLevel: "INFO",
  persistentKeys: { environment: "production" },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    logger.addContext(request, ctx); // enriches with CF properties + correlation ID

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

#### Scoping with `withComponent()` — module-level sub-loggers

Use `withComponent()` to create a named sub-logger for a module, class, or layer. Call it **once at module scope** — the child shares the parent's request context (correlation ID, CF properties) so `addContext()` on the parent is immediately reflected in all children.

```typescript
// deckRepository.ts
import { logger } from "./logger"; // shared module-level logger

const repoLog = logger.withComponent("deckRepository");
// Nesting composes automatically with " > " separator, max depth 5:
const queryLog = repoLog.withComponent("query");

export async function getDeck(id: string) {
  repoLog.info("fetching deck", { deckId: id });
  // { component: "deckRepository", message: "fetching deck", ... }

  queryLog.info("executing SQL");
  // { component: "deckRepository > query", message: "executing SQL", ... }
}
```

#### Scoping with `child()` — per-invocation isolation

Use `child()` when you need **isolated context per call** — particularly inside Durable Object RPC methods, where a single logger instance handles concurrent calls. Unlike `appendTemporaryKeys()`, `child()` returns a new Logger with its own independent key store and state, so concurrent calls cannot clobber each other's context.

```typescript
import { DurableObject } from "cloudflare:workers";
import { Logger } from "@workers-powertools/logger";

const logger = new Logger({ serviceName: "slide-builder" });
// Module-level component scoping (shared, safe):
const doLog = logger.withComponent("SlideBuilder");

export class SlideBuilder extends DurableObject {
  async generateSlides(prompt: string, correlationId: string) {
    // Per-invocation child — isolated, no shared mutation:
    const log = doLog.child({
      correlation_id: correlationId,
      operation: "generateSlides",
    });

    log.info("generating slides", { prompt });
    // { component: "SlideBuilder", correlation_id: "req-123",
    //   operation: "generateSlides", message: "generating slides" }

    // Concurrent calls each get their own `log` — no bleed-through
  }

  async onAlarm() {
    const log = doLog.child({ operation: "onAlarm" });
    log.info("alarm fired");
  }
}
```

> **Why not `appendTemporaryKeys()`?** In a Durable Object, multiple RPC calls can execute concurrently on the same instance. `appendTemporaryKeys` mutates the shared logger, so Call A's keys bleed into Call B's log entries and `clearTemporaryKeys()` in one call's `finally` block silently wipes the other's context. `child()` avoids this entirely — each call gets its own logger with no shared mutable state.

#### Scoping with `withRpcContext()` — explicit RPC context with auto-cleanup

Use `withRpcContext()` when you need to set context on the **shared logger** for the duration of an RPC call and want guaranteed cleanup via the `using` keyword (TC39 explicit resource management). Best for WorkerEntrypoints and plain DOs where you accept the single-call-at-a-time constraint.

```typescript
import { WorkerEntrypoint } from "cloudflare:workers";
import { Logger } from "@workers-powertools/logger";

const logger = new Logger({ serviceName: "item-processor" });

export class ItemProcessor extends WorkerEntrypoint {
  async processItem(item: Item, correlationId: string) {
    using _ctx = logger.withRpcContext({
      correlationId,
      agent: "ItemProcessor",
      operation: "processItem",
    });
    // Cleanup is guaranteed on scope exit, even on throw
    logger.info("processing item", { itemId: item.id });
  }
}
```

#### Scoping with `injectAgentContext()` — Agents SDK integration

Use `injectAgentContext()` from `@workers-powertools/agents` inside Agents SDK methods. It calls `getCurrentAgent()` internally to resolve agent name and connection ID automatically — no need to thread `this` or pass extra parameters.

```typescript
import { Agent } from "agents";
import { Logger } from "@workers-powertools/logger";
import { Tracer } from "@workers-powertools/tracer";
import { injectAgentContext } from "@workers-powertools/agents";

const logger = new Logger({ serviceName: "slide-builder" });
const tracer = new Tracer({ serviceName: "slide-builder" });
const agentLog = logger.withComponent("SlideBuilder");

export class SlideBuilder extends Agent<Env> {
  async generateSlides(prompt: string, correlationId?: string) {
    // agent name, connection ID resolved automatically from getCurrentAgent()
    const log = agentLog.child(
      injectAgentContext({
        logger: agentLog,
        tracer,
        operation: "generateSlides",
        correlationId,
      }).correlationId
        ? { correlation_id: correlationId! }
        : {},
    );
    // Or more simply, use injectAgentContext directly:
    using _ctx = injectAgentContext({
      logger: agentLog,
      tracer,
      operation: "generateSlides",
      correlationId,
    });

    agentLog.info("generating slides", { prompt });
    // { component: "SlideBuilder", agent: "slide-builder-instance",
    //   operation: "generateSlides", connection_id: "conn_abc",
    //   correlation_id: "req-123", ... }
  }
}
```

#### Summary: which scoping method to use

| Scenario                                    | Method                      | Why                                                                              |
| ------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| Module/class sub-logger, created once       | `withComponent()`           | Shares parent request context; component path composed automatically             |
| Concurrent DO RPC calls                     | `child()`                   | Fully isolated state — concurrent calls can't clobber each other                 |
| Single-threaded RPC with guaranteed cleanup | `withRpcContext()`          | Works with `using` for automatic cleanup; sets context on shared logger          |
| Agents SDK methods                          | `injectAgentContext()`      | Resolves agent name + connection ID automatically via `getCurrentAgent()`        |
| Hono route handlers                         | `injectLogger()` middleware | Context injected automatically; `clearTemporaryKeys()` called after each request |

### Metrics

#### Buffered mode — Worker fetch handlers

The default. Metrics are queued and written together after the response is sent, so they never add latency to the request.

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

    // Non-blocking — writes happen after the response is returned
    ctx.waitUntil(metrics.flush());
    return new Response(JSON.stringify(result));
  },
};
```

#### `flushSync()` — Durable Object RPC methods with ExecutionContext

When you have `this.ctx` available in a DO, you can pass it to `waitUntil`. If you don't, call `flushSync()` directly — `writeDataPoint()` is fire-and-forget on the Analytics Engine binding and does not block.

```typescript
import { DurableObject } from "cloudflare:workers";
import { Metrics, MetricUnit } from "@workers-powertools/metrics";

const metrics = new Metrics({ namespace: "slide-builder", serviceName: "api" });

export class SlideBuilder extends DurableObject {
  async generateSlides(prompt: string) {
    metrics.setBinding(this.env.ANALYTICS);
    metrics.addMetric("slidesGenerated", MetricUnit.Count, 1);

    const result = await buildSlides(prompt);

    metrics.addMetric("slideCount", MetricUnit.None, result.slides.length);

    // Option A: if this.ctx is available
    this.ctx.waitUntil(metrics.flush());

    // Option B: if ctx is not available — writeDataPoint() is sync under the hood
    metrics.flushSync();

    return result;
  }
}
```

#### `autoFlush: true` — alarm handlers and queue consumers

When there is no `ExecutionContext` at all (scheduled alarms, queue callbacks in some configurations), set `autoFlush: true`. Each metric is written immediately on `addMetric()` — no explicit flush call needed, ever.

```typescript
import { DurableObject } from "cloudflare:workers";
import { Metrics, MetricUnit } from "@workers-powertools/metrics";

// autoFlush: true — safe for any context including alarm handlers
const metrics = new Metrics({
  namespace: "slide-builder",
  serviceName: "api",
  autoFlush: true,
});

export class SlideBuilder extends DurableObject {
  async alarm() {
    metrics.setBinding(this.env.ANALYTICS);
    metrics.addMetric("alarmFired", MetricUnit.Count, 1); // written immediately
    await runScheduledCleanup();
    metrics.addMetric("cleanupComplete", MetricUnit.Count, 1); // written immediately
    // No flush() call needed
  }
}
```

> **Which mode to use:**
> | Context | Mode | Call |
> |---|---|---|
> | Worker fetch handler | Buffered (default) | `ctx.waitUntil(metrics.flush())` |
> | DO RPC with `this.ctx` available | Buffered | `this.ctx.waitUntil(metrics.flush())` |
> | DO RPC without ctx | Buffered | `metrics.flushSync()` |
> | DO alarm / queue consumer | Auto-flush | `autoFlush: true`, no flush call needed |

````

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
````

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
