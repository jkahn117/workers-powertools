# @workers-powertools/astro

Astro middleware adapters for Workers Powertools. This package adapts the existing `logger`, `tracer`, and `metrics` utilities to Astro middleware running on Cloudflare Workers.

Part of [Workers Powertools](../../README.md) — a developer toolkit for observability and reliability best practices on Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

## Installation

```bash
pnpm add @workers-powertools/astro astro
```

You will also need the core packages you want to use:

```bash
pnpm add @workers-powertools/logger @workers-powertools/tracer @workers-powertools/metrics
```

Subpath exports are available if you want to import only the adapter surface you need:

```typescript
import { injectLogger } from "@workers-powertools/astro/logger";
import { injectMetrics } from "@workers-powertools/astro/metrics";
import { injectTracer } from "@workers-powertools/astro/tracer";
import { injectObservability } from "@workers-powertools/astro/observability";
```

## Usage

Create `src/middleware.ts` in your Astro app:

```typescript
import { sequence } from "astro:middleware";
import { env } from "cloudflare:workers";
import { injectLogger } from "@workers-powertools/astro/logger";
import { injectMetrics } from "@workers-powertools/astro/metrics";
import { injectTracer } from "@workers-powertools/astro/tracer";
import { Logger } from "@workers-powertools/logger";
import { Metrics } from "@workers-powertools/metrics";
import { Tracer } from "@workers-powertools/tracer";

const logger = new Logger({ serviceName: "astro-app" });
const tracer = new Tracer({ serviceName: "astro-app" });
const metrics = new Metrics({ namespace: "astro-app", serviceName: "web" });

export const onRequest = sequence(
  injectLogger({ logger, runtimeEnv: env, componentName: "astro" }),
  injectTracer({ tracer, runtimeEnv: env }),
  injectMetrics({ metrics, runtimeEnv: env }),
);
```

This middleware will:

- create a request-scoped child logger and store it on `Astro.locals`
- create a request span and store `tracer` + `correlationId` on `Astro.locals`
- record `request_duration` and `request_count` metrics and flush them via `cfContext.waitUntil()`

## Convenience Middleware

Use `injectObservability()` when you want one middleware instead of composing three:

```typescript
import { env } from "cloudflare:workers";
import { injectObservability } from "@workers-powertools/astro/observability";

export const onRequest = injectObservability({
  logger,
  tracer,
  metrics,
  runtimeEnv: env,
  componentName: "astro",
});
```

## Accessing Locals

The middleware stores observability utilities on `Astro.locals` / `context.locals`.

Recommended `src/env.d.ts` augmentation:

```typescript
/// <reference types="astro/client" />

import type { AstroObservabilityLocals } from "@workers-powertools/astro";
import type { Runtime } from "@astrojs/cloudflare";

declare global {
  namespace App {
    interface Locals extends Runtime, AstroObservabilityLocals {}
  }
}
```

Then use it inside pages or endpoints:

```typescript
export const GET = async (context) => {
  context.locals.logger?.info("Handling Astro endpoint");
  return new Response("ok");
};
```

## Metrics Backend Helper

By default, `injectMetrics()` looks for `env.METRICS_PIPELINE` and creates a `PipelinesBackend` automatically.

You can also resolve it directly:

```typescript
import { getMetricsBackendFromEnv } from "@workers-powertools/astro/metrics";

const backend = getMetricsBackendFromEnv(env);
```

Use `bindingName` to customize:

```typescript
const backend = getMetricsBackendFromEnv(env, { bindingName: "MY_PIPELINE" });
```

## Scope

This package is for Astro middleware. If your Cloudflare Worker uses Hono in front of Astro, use:

- `@workers-powertools/hono` for the Hono layer
- `@workers-powertools/astro` for Astro middleware
- `@workers-powertools/agents` for agent RPC / Durable Object helpers
