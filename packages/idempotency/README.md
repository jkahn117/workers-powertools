# @workers-powertools/idempotency

Exactly-once execution with pluggable persistence for Cloudflare Workers. Prevents duplicate processing of webhooks, queue messages, payment flows, and other at-least-once events.

Part of [Workers Powertools](../../README.md) — a developer toolkit for observability and reliability best practices on Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

## Features

- **Exactly-once semantics** — wraps any async function; first invocation executes and stores the result, subsequent invocations within the TTL return the stored result
- **Pluggable persistence** — KV and D1 backends included; implement `PersistenceLayer` for custom stores
- **Payload validation** — optional SHA-256 hash verification ensures cache hits match the original input
- **Conflict detection** — concurrent duplicate requests receive an `IdempotencyConflictError` (409)
- **TTL-based expiry** — records auto-expire after a configurable duration

## Installation

```bash
pnpm add @workers-powertools/idempotency
```

For KV persistence:

```bash
pnpm add @workers-powertools/idempotency
```

The `KVPersistenceLayer` is exported from `@workers-powertools/idempotency/kv`. The `D1PersistenceLayer` is exported from `@workers-powertools/idempotency/d1`.

## Quick Start

### With KV persistence

```typescript
import { makeIdempotent, IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

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
    persistenceLayer ??= new KVPersistenceLayer({ binding: env.IDEMPOTENCY_KV });
    const event = (await request.json()) as { orderId: string; amount: number };
    const result = await processPayment(event);
    return Response.json(result);
  },
};
```

### With D1 persistence

```typescript
import { D1PersistenceLayer } from "@workers-powertools/idempotency/d1";

const persistence = new D1PersistenceLayer({ binding: env.DB });
await persistence.initialize(); // creates table if not exists
```

### With Hono

```typescript
import { injectIdempotency } from "@workers-powertools/hono";

app.post(
  "/orders",
  async (c, next) => {
    persistenceLayer ??= new KVPersistenceLayer({ binding: c.env.IDEMPOTENCY_KV });
    return injectIdempotency({ persistenceLayer, config: idempotencyConfig })(c, next);
  },
  async (c) => {
    const body = await c.req.json<{ name: string }>();
    return c.json({ name: body.name, status: "created" }, 201);
  },
);
```

## API

| Export                        | Description                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `makeIdempotent(fn, options)` | Wrap an async function with idempotency protection                               |
| `IdempotencyConfig`           | Configuration: `eventKeyPath`, `expiresAfterSeconds`, `payloadValidationEnabled` |
| `KVPersistenceLayer`          | KV-backed persistence (import from `/kv`)                                        |
| `D1PersistenceLayer`          | D1-backed persistence (import from `/d1`)                                        |
| `IdempotencyConflictError`    | Thrown when a concurrent duplicate is detected                                   |
| `PersistenceLayer`            | Interface for custom persistence implementations                                 |
