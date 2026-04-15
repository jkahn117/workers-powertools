# @workers-powertools/logger

Structured JSON logging for Cloudflare Workers with context enrichment, correlation IDs, log levels, debug sampling, and log buffering.

Part of [Workers Powertools](../../README.md) — a developer toolkit for observability and reliability best practices on Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

## Features

- **Structured JSON output** — every log entry is a JSON object with `level`, `message`, `timestamp`, `service`, and any custom keys
- **Workers context enrichment** — `addContext(request, ctx, env)` injects CF properties (`colo`, `country`, `asn`), correlation ID, and runtime env vars
- **Correlation IDs** — extracted from `x-request-id`, `x-correlation-id`, or `cf-ray` headers; auto-generated if missing
- **Scoping** — `withComponent()` for module-level sub-loggers, `child()` for per-invocation isolation in Durable Objects, `withRpcContext()` for `using`-based auto-cleanup
- **Log levels** — `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `CRITICAL`, `SILENT`
- **Debug sampling** — `debugSampleRate` promotes a percentage of requests to DEBUG level
- **Log buffering** — buffer logs below the current level; flush them all on `ERROR`/`CRITICAL`

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

## API

| Method                            | Description                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| `addContext(request, ctx?, env?)` | Enrich logger with CF properties, correlation ID, and env var config |
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
| `error(message, errorOrExtra?)`   | Log at ERROR level; accepts `Error` objects                          |
| `critical(message, extra?)`       | Log at CRITICAL level                                                |
