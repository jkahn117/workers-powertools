# @workers-powertools/tanstack-start

TanStack Start middleware adapters for Workers Powertools. This package adapts the existing `logger`, `tracer`, and `metrics` utilities to TanStack Start's request middleware, server function middleware, and Worker request lifecycle.

Part of [Workers Powertools](../../README.md) — a developer toolkit for observability and reliability best practices on Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

> **Framework adapters** — this is the TanStack Start adapter. The core packages (`logger`, `metrics`, `tracer`) remain framework-agnostic and can be used directly in any Workers project.

## Installation

```bash
pnpm add @workers-powertools/tanstack-start @tanstack/start-client-core
```

You will also need the core packages you want to use:

```bash
pnpm add @workers-powertools/logger @workers-powertools/tracer @workers-powertools/metrics
```

Subpath exports are available if you want to import only the adapter surface you need:

```typescript
import { injectLogger } from "@workers-powertools/tanstack-start/logger";
import { injectMetrics } from "@workers-powertools/tanstack-start/metrics";
import { injectTracer } from "@workers-powertools/tanstack-start/tracer";
import { injectObservability } from "@workers-powertools/tanstack-start/observability";
import { withStartRequestObservability } from "@workers-powertools/tanstack-start/request-helper";
```

## Exports

| Export                                    | Description                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `injectLogger(options)`                   | Request middleware that creates a request-scoped child logger and injects request context                                            |
| `injectTracer(options)`                   | Request middleware that creates a request span and injects `tracer` + `correlationId` into Start context                             |
| `injectMetrics(options)`                  | Request middleware that resolves the metrics backend, records `request_duration` and `request_count`, and flushes after the response |
| `injectServerFnTracer(options)`           | Server function middleware that wraps server functions in spans                                                                      |
| `injectObservability(options)`            | Convenience request middleware that composes logger, tracer, and optional metrics                                                    |
| `withStartRequestObservability(args)`     | Low-level Worker `fetch()` helper for apps that own the Start entrypoint directly                                                    |
| `getMetricsBackendFromEnv(env, options?)` | Helper that resolves `env.METRICS_PIPELINE` into a `PipelinesBackend`                                                                |

## Request Middleware

### `injectLogger({ logger, componentName? })`

Creates a request-scoped child logger, calls `addContext(request, ctx, env)`, and clears temporary keys after the request completes.

### `injectTracer({ tracer, requestSpanName? })`

Calls `tracer.addContext(request, ctx, env)`, wraps the request in `captureAsync()`, and injects `tracer` and `correlationId` into the downstream Start context.

Default span name: `METHOD /pathname`

### `injectMetrics({ metrics, metricsBackendFactory?, captureHttpMetrics? })`

Resolves the metrics backend for the request, reuses the request correlation ID when present, records:

- `request_duration`
- `request_count`

with these dimensions:

- `method`
- `route`
- `status`

Then flushes metrics via `ctx.waitUntil(metrics.flush())`.

If `metricsBackendFactory` is not provided, it will look for `env.METRICS_PIPELINE` and create a `PipelinesBackend` automatically.

## Server Function Middleware

### `injectServerFnTracer({ tracer, serverFnSpanName? })`

Wraps TanStack Start server functions in a span.

Default span name: `serverFn.<name>`

This is useful when you want server functions to appear as separate traced operations without creating a second request-level metrics lifecycle.

## Convenience Middleware

### `injectObservability(options)`

Composes `injectLogger`, `injectTracer`, and optional `injectMetrics` into one request middleware.

```typescript
import { injectObservability } from "@workers-powertools/tanstack-start";
import { Logger } from "@workers-powertools/logger";
import { Tracer } from "@workers-powertools/tracer";
import { Metrics } from "@workers-powertools/metrics";

const logger = new Logger({ serviceName: "app" });
const tracer = new Tracer({ serviceName: "app" });
const metrics = new Metrics({ namespace: "app", serviceName: "server" });

export const requestObservabilityMiddleware = injectObservability({
  logger,
  tracer,
  metrics,
  componentName: "server",
});
```

## Example Usage In `src/start.ts`

```typescript
import { createStart } from "@tanstack/react-start";
import {
  injectObservability,
  injectServerFnTracer,
} from "@workers-powertools/tanstack-start";
import { logger } from "./lib/logger";
import { tracer } from "./lib/tracer";
import { metrics } from "./lib/metrics";

export const requestObservabilityMiddleware = injectObservability({
  logger,
  tracer,
  metrics,
  componentName: "server",
});

export const serverFnObservabilityMiddleware = injectServerFnTracer({
  tracer,
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [requestObservabilityMiddleware],
    functionMiddleware: [serverFnObservabilityMiddleware],
  };
});
```

## Example Usage In `src/server.ts`

Use `withStartRequestObservability()` when you own the Worker entrypoint directly and need to pass observability utilities into Start's request context yourself.

```typescript
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { withStartRequestObservability } from "@workers-powertools/tanstack-start";
import { logger } from "./lib/logger";
import { tracer } from "./lib/tracer";
import { metrics } from "./lib/metrics";

const appHandler = createStartHandler(({ request, router, responseHeaders }) => {
  return defaultStreamHandler({ request, router, responseHeaders });
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return withStartRequestObservability({
      request,
      env,
      ctx,
      logger,
      tracer,
      metrics,
      componentName: "server",
      buildContext: ({ env, logger, tracer, metrics, correlationId }) => ({
        env,
        logger,
        tracer,
        metrics,
        correlationId,
      }),
      handle: async ({ context }) => {
        return appHandler(request, {
          context,
        });
      },
    });
  },
};
```

## Suggested Start Context Shape

Expose `env`, `logger`, `tracer`, `metrics`, and `correlationId` through TanStack Start's request context:

```typescript
declare module "@tanstack/react-router" {
  interface Register {
    server: {
      requestContext: {
        env: Env;
        ctx: ExecutionContext;
        logger: Logger;
        tracer: Tracer;
        metrics?: Metrics;
        correlationId?: string;
      };
    };
  }
}
```

The adapter expects `env` and `ctx` to be available on the request context for request middleware.

## Metrics Backend Helper

```typescript
import { getMetricsBackendFromEnv } from "@workers-powertools/tanstack-start";

const backend = getMetricsBackendFromEnv(env);
```

By default it looks for `env.METRICS_PIPELINE`. Use `bindingName` to customize:

```typescript
const backend = getMetricsBackendFromEnv(env, { bindingName: "MY_PIPELINE" });
```

## Example App

See [`examples/tanstack-start-worker`](../../examples/tanstack-start-worker) for a minimal Cloudflare Workers + TanStack Start app that uses `injectObservability` and `injectServerFnTracer`.
