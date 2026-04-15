# @workers-powertools/metrics

Named business metrics for Cloudflare Workers with per-call dimensions, non-blocking flush, and two backend options: **Cloudflare Pipelines** (recommended) and **Analytics Engine** (opt-in).

Part of [Workers Powertools](../../README.md) — a developer toolkit for observability and reliability best practices on Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

> **Do not use this utility to re-emit infrastructure signals** that the Workers platform already provides for free (request count, CPU time, error rate, p99 latency). Those are available via the Workers Metrics dashboard and GraphQL API at zero cost. This package is for **business metrics** — `successfulBooking`, `deckGenerated`, `failedPayment`, etc.

## Features

- **Per-call dimensions** — dimensions are passed explicitly on each `addMetric()` call, avoiding shared mutable state and concurrency hazards in Workers isolates
- **Two backends** — Pipelines (named-field JSON → R2/Iceberg, queryable by column name) or Analytics Engine (positional blobs, for existing AE dashboards)
- **Non-blocking flush** — metrics are buffered and written after the response via `ctx.waitUntil(metrics.flush())`
- **Auto-flush mode** — for alarm handlers and queue consumers where `ExecutionContext` is unavailable
- **Correlation IDs** — `setCorrelationId()` propagates a correlation ID into every flushed record
- **Zero external runtime dependencies** — minimal bundle impact

## Installation

```bash
pnpm add @workers-powertools/metrics
```

## Setting up Cloudflare Pipelines

Metrics are written to [Cloudflare Pipelines](https://developers.cloudflare.com/pipelines/), which streams JSON records into an R2 bucket as Parquet files. You can then query them with [R2 SQL](https://developers.cloudflare.com/r2-sql/).

### 1. Create an R2 bucket

```bash
npx wrangler r2 bucket create my-metrics
```

### 2. Enable R2 Data Catalog on the bucket

This lets you query the data with R2 SQL later:

```bash
npx wrangler r2 bucket catalog enable my-metrics
```

Note the **Warehouse name** from the output — you'll need it for queries.

### 3. Create a Pipeline

The quickest way is the interactive setup:

```bash
npx wrangler pipelines setup
```

Follow the prompts:

- **Pipeline name**: e.g. `ecommerce-metrics`
- **Stream configuration**: enable HTTP endpoint, no auth, JSON format
- **Sink configuration**: choose **Data Catalog (Iceberg)**, select your bucket, table name (e.g. `metrics`)

Or create it in one command:

```bash
npx wrangler pipelines create ecommerce-metrics --r2-bucket my-metrics
```

### 4. Add the Pipeline binding to your Worker

In `wrangler.jsonc`:

```jsonc
{
  "pipelines": [
    {
      "pipeline": "ecommerce-metrics",
      "binding": "METRICS_PIPELINE",
    },
  ],
}
```

Or in `wrangler.toml`:

```toml
[[pipelines]]
pipeline = "ecommerce-metrics"
binding = "METRICS_PIPELINE"
```

### 5. Query your metrics with R2 SQL

```bash
export WRANGLER_R2_SQL_AUTH_TOKEN=your-api-token

npx wrangler r2 sql query YOUR_WAREHOUSE "
  SELECT metric_name, metric_value, route, method, status, timestamp
  FROM default.metrics
  WHERE metric_name = 'request_duration'
    AND __ingest_ts > NOW() - INTERVAL '1' DAY
  ORDER BY __ingest_ts DESC
  LIMIT 100
"
```

See the [R2 SQL reference](https://developers.cloudflare.com/r2-sql/sql-reference/) for full query syntax.

## Usage

### Buffered mode — Worker fetch handlers (recommended)

```typescript
import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";

const metrics = new Metrics({
  namespace: "ecommerce",
  serviceName: "orders",
  defaultDimensions: { environment: "production" },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    metrics.setBackend(new PipelinesBackend({ binding: env.METRICS_PIPELINE }));

    const start = Date.now();
    const result = await processOrder(request);

    metrics.addMetric("orderLatency", MetricUnit.Milliseconds, Date.now() - start, {
      endpoint: "/orders",
    });
    metrics.addMetric("orderValue", MetricUnit.None, result.total, {
      endpoint: "/orders",
    });

    ctx.waitUntil(metrics.flush());
    return new Response(JSON.stringify(result));
  },
};
```

### Durable Object RPC methods

```typescript
import { DurableObject } from "cloudflare:workers";
import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";

const metrics = new Metrics({ namespace: "slide-builder", serviceName: "api" });

export class SlideBuilder extends DurableObject {
  async generateSlides(prompt: string, correlationId: string) {
    metrics.setBackend(new PipelinesBackend({ binding: this.env.METRICS_PIPELINE }));
    metrics.setCorrelationId(correlationId);

    const result = await buildSlides(prompt);

    metrics.addMetric("slidesGenerated", MetricUnit.Count, 1, {
      prompt_length: String(prompt.length),
    });

    // Option A: if this.ctx is available
    this.ctx.waitUntil(metrics.flush());

    // Option B: if ctx is not available
    metrics.flushSync();

    return result;
  }
}
```

### Auto-flush — alarm handlers and queue consumers

```typescript
const metrics = new Metrics({
  namespace: "slide-builder",
  serviceName: "api",
  autoFlush: true,
});

export class SlideBuilder extends DurableObject {
  async alarm() {
    metrics.setBackend(new PipelinesBackend({ binding: this.env.METRICS_PIPELINE }));
    metrics.addMetric("alarmFired", MetricUnit.Count, 1); // written immediately
    await runScheduledCleanup();
    metrics.addMetric("cleanupComplete", MetricUnit.Count, 1); // written immediately
  }
}
```

### With Hono

Use the `injectMetrics` middleware from `@workers-powertools/hono`:

```typescript
import { injectMetrics } from "@workers-powertools/hono";
import { PipelinesBackend } from "@workers-powertools/metrics";

app.use(
  injectMetrics(metrics, {
    backendFactory: (env) =>
      new PipelinesBackend({ binding: env.METRICS_PIPELINE as PipelineBinding }),
  }),
);
```

The middleware records `request_duration` and `request_count` with `route`, `method`, and `status` dimensions, then flushes via `ctx.waitUntil()`.

## Why per-call dimensions?

In a Workers isolate, a module-level `Metrics` singleton is shared across concurrent requests. If dimensions were accumulated on the instance (e.g., `addDimension("route", "/orders")` then `addMetric(...)`), concurrent requests would clobber each other's dimensions — request A's `route` would appear in request B's metrics.

By passing dimensions explicitly on each `addMetric()` call, every metric carries its own isolated dimensions with no shared mutable state. Use `defaultDimensions` for static values (environment, version) that apply to every metric.

## Which flush mode?

| Context                   | Mode               | Call                                    |
| ------------------------- | ------------------ | --------------------------------------- |
| Worker fetch handler      | Buffered (default) | `ctx.waitUntil(metrics.flush())`        |
| DO RPC with `this.ctx`    | Buffered           | `this.ctx.waitUntil(metrics.flush())`   |
| DO RPC without ctx        | Buffered           | `metrics.flushSync()`                   |
| DO alarm / queue consumer | Auto-flush         | `autoFlush: true`, no flush call needed |

## Analytics Engine (opt-in)

If you have existing Analytics Engine dashboards, you can use the `AnalyticsEngineBackend`:

```typescript
import { AnalyticsEngineBackend } from "@workers-powertools/metrics";

metrics.setBackend(new AnalyticsEngineBackend({ binding: env.ANALYTICS }));
```

**Limitations**: positional blobs (no named columns), 20-dimension limit, single numeric value per data point, no schema enforcement. For new applications, use `PipelinesBackend` instead.

## API

| Method                                      | Description                                                      |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `addMetric(name, unit, value, dimensions?)` | Record a named metric with optional per-call dimensions          |
| `setBackend(backend)`                       | Set or replace the metrics backend (idempotent for same binding) |
| `setCorrelationId(id)`                      | Set correlation ID for the current context (cleared on flush)    |
| `flush()`                                   | Async flush buffered metrics via `ctx.waitUntil()`               |
| `flushSync()`                               | Sync fire-and-forget flush (for DO RPC without ctx)              |

## Metric Units

| Unit           | Description              |
| -------------- | ------------------------ |
| `Count`        | Count of occurrences     |
| `Milliseconds` | Duration in milliseconds |
| `Seconds`      | Duration in seconds      |
| `Bytes`        | Size in bytes            |
| `Kilobytes`    | Size in kilobytes        |
| `Megabytes`    | Size in megabytes        |
| `Percent`      | Percentage value         |
| `None`         | No specific unit         |
