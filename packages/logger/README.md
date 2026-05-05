# @workers-powertools/logger

Structured JSON logging for Cloudflare Workers with context enrichment, correlation IDs, log levels, debug sampling, log buffering, wide events, PII redaction, structured errors, and two-tier sampling.

Part of [Workers Powertools](../../README.md) — a developer toolkit for observability and reliability best practices on Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

## Features

- **Structured JSON output** — every log entry is a JSON object with `level`, `message`, `timestamp`, `service`, and any custom keys
- **Wide events** — `createEvent()` accumulates context throughout a request and emits a single information-dense log entry with `duration_ms`
- **Workers context enrichment** — `addContext(request, ctx, env)` injects CF properties (`colo`, `country`, `asn`), correlation ID, and runtime env vars
- **Correlation IDs** — extracted from `x-request-id`, `x-correlation-id`, or `cf-ray` headers; auto-generated if missing
- **Scoping** — `withComponent()` for module-level sub-loggers, `child()` for per-invocation isolation in Durable Objects, `withRpcContext()` for `using`-based auto-cleanup
- **Log levels** — `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `CRITICAL`, `SILENT`
- **Debug sampling** — `debugSampleRate` promotes a percentage of requests to DEBUG level
- **Log buffering** — buffer logs below the current level; flush them all on `ERROR`/`CRITICAL` (configurable `maxBufferSize`, default 1000)
- **PII redaction** — auto-mask credit cards, emails, IPs, JWTs via `redact` config; builtin patterns available from `@workers-powertools/logger/redact`
- **Structured errors** — pass `{ error, why, fix, link }` to `logger.error()` for actionable diagnostics in log entries
- **Two-tier sampling** — `sampleRate` (0-1) drops non-error logs for a percentage of requests while always emitting errors/criticals
- **Per-request reset** — `resetContext()` clears correlation IDs, CF properties, and temporary keys between requests for vanilla Workers

## Installation

```bash
pnpm add @workers-powertools/logger
```

## Quick Start

### Basic usage — Workers fetch handler

```typescript
import { Logger } from "@workers-powertools/logger";

const logger = new Logger({
  serviceName: "payment-api",
  logLevel: "INFO",
  persistentKeys: { environment: "production" },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    logger.addContext(request, ctx, env);

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

### Wide Events — one log per request

```typescript
const event = logger.createEvent("request handled");

event.set({ user: { id: 42, plan: "pro" } });
event.set({ cart: { items: 3, total: 9999 } });

event.emit(); // single log entry with all fields + duration_ms
```

With Hono middleware (auto-create and auto-emit):

```typescript
import { injectLogger } from "@workers-powertools/hono";

app.use(injectLogger(logger, { wideEvent: true }));

app.get("/orders", (c) => {
  const event = c.get("wideEvent");
  event.set({ ordersFound: 42 });
  return c.json(orders);
  // event auto-emits with { status: 200, duration_ms: ... }
});
```

### Scoping with `withComponent()` — module-level sub-loggers

```typescript
const repoLog = logger.withComponent("deckRepository");
repoLog.info("deck persisted", { deckId });
// { component: "deckRepository", message: "deck persisted", ... }
```

### Scoping with `child()` — per-invocation isolation (Durable Objects)

```typescript
async generateSlides(prompt: string, correlationId: string) {
  const log = logger.child({
    correlation_id: correlationId,
    operation: "generateSlides",
  });
  log.info("generating slides", { prompt });
  // Concurrent calls each get their own `log` — no bleed-through
}
```

### Scoping with `withRpcContext()` — auto-cleanup via `using`

```typescript
async processItem(item: Item, correlationId: string) {
  using _ctx = logger.withRpcContext({
    correlationId,
    agent: "ItemProcessor",
    operation: "processItem",
  });
  logger.info("processing item", { itemId: item.id });
  // Cleanup is guaranteed on scope exit, even on throw
}
```

### With Hono

Use the `injectLogger` middleware from `@workers-powertools/hono`:

```typescript
import { injectLogger } from "@workers-powertools/hono";

app.use(injectLogger(logger));
```

The middleware calls `addContext()` before the handler and `clearTemporaryKeys()` after.

### PII Redaction

```typescript
import { BUILTIN_REDACT_PATTERNS } from "@workers-powertools/logger/redact";

const logger = new Logger({
  redact: {
    enabled: true,
    patterns: Object.values(BUILTIN_REDACT_PATTERNS),
  },
});

logger.info("charge processed", { email: "user@example.com", card: "4111-1111-1111-1111" });
// { message: "charge processed", email: "[REDACTED_EMAIL]", card: "[REDACTED_CARD]" }
```

### Structured Errors

```typescript
logger.error("Payment failed", {
  error: new Error("Card declined"),
  why: "Insufficient funds on the payment method",
  fix: "Retry with a different payment method or contact the issuing bank",
  link: "https://docs.example.com/payments/troubleshooting#declined",
});
// { error_name: "Error", error_message: "Card declined", why: "...", fix: "...", link: "..." }
```

### Two-Tier Sampling

```typescript
const logger = new Logger({
  sampleRate: 0.1, // emit non-error logs for only 10% of requests
});
// Errors and criticals always emit regardless of sampleRate
```

### Vanilla Worker — resetContext

```typescript
const logger = new Logger();

export default {
  async fetch(request, env, ctx) {
    logger.resetContext(); // prevent state leaking between requests
    logger.addContext(request, ctx, env);
    // ...
  },
};
```

## Migration Guide: Scattered Logs → Wide Events

If you have an existing app using scattered `logger.info()` calls throughout your handler, migrating to wide events is straightforward.

### Before (scattered logs)

```typescript
export default {
  async fetch(request, env, ctx) {
    logger.addContext(request, ctx, env);
    logger.info("Request received", { path: url.pathname });
    // ... processing ...
    logger.info("User found", { userId: 42 });
    // ... more processing ...
    logger.info("Order created", { orderId: "abc123" });
    return Response.json(order);
  },
};
// Produces 3+ log entries per request — noisy, hard to correlate
```

### After (wide event)

```typescript
export default {
  async fetch(request, env, ctx) {
    logger.resetContext();
    logger.addContext(request, ctx, env);
    const event = logger.createEvent("request handled");
    event.set({ path: new URL(request.url).pathname });

    const user = await getUser(request);
    event.set({ userId: user.id });

    const order = await createOrder(user);
    event.set({ orderId: order.id, status: 200 });

    event.emit(); // one entry with everything + duration_ms
    return Response.json(order);
  },
};
```

### With Hono (auto-emit)

```typescript
// Before:
app.use(injectLogger(logger));
app.use(injectTracer(tracer)); // deprecated — remove

// After:
app.use(injectLogger(logger, { wideEvent: true }));
// No tracer needed — wide event replaces scattered logs + spans
```

### With TanStack Start / Astro

```typescript
// Before:
const middleware = injectObservability({ logger, tracer, metrics });

// After:
const middleware = injectObservability({ logger, metrics, wideEvent: true });
// tracer is now optional
```

### Tips

- Keep `logger.error()` calls for unexpected failures — they trigger buffer flush
- Use `event.set()` for happy-path context accumulation
- Wide events are most useful for request handlers; keep `logger.info()` for background jobs or Durable Object lifecycle logging
- You can use both patterns together — wide events for per-request summaries, traditional logs for within-request debugging

## API

| Method                            | Description                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| `addContext(request, ctx?, env?)` | Enrich logger with CF properties, correlation ID, and env var config |
| `createEvent(message, level?)`    | Create a wide event that accumulates context via `set()` and emits once via `emit()` |
| `getCorrelationId()`              | Get the correlation ID extracted or generated by `addContext()`       |
| `withComponent(name)`             | Create a sub-logger with a `component` field                         |
| `child(extraKeys)`                | Create an isolated child logger (safe for concurrent DO RPC)         |
| `withRpcContext(context)`         | Set RPC context with `using`-based auto-cleanup                      |
| `appendPersistentKeys(keys)`      | Add keys to every log entry permanently                              |
| `appendTemporaryKeys(keys)`       | Add keys until `clearTemporaryKeys()` is called                      |
| `clearTemporaryKeys()`            | Clear temporary keys                                                 |
| `trace(message, extra?)`          | Log at TRACE level                                                   |
| `debug(message, extra?)`          | Log at DEBUG level                                                   |
| `info(message, extra?)`           | Log at INFO level                                                    |
| `warn(message, extra?)`           | Log at WARN level                                                    |
| `error(message, errorOrExtra?)`   | Log at ERROR level; accepts `Error`, `StructuredErrorInfo`, or plain object |
| `critical(message, extra?)`       | Log at CRITICAL level                                                |
| `resetContext()`                  | Reset per-request state (correlation ID, CF props, temp keys, buffer) |
| `getCorrelationId()`              | Get the correlation ID extracted or generated by `addContext()`       |
