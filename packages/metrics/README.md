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

Subpath exports are also available when you want to keep backend imports explicit:

```typescript
import { Metrics, MetricUnit } from "@workers-powertools/metrics";
import { PipelinesBackend } from "@workers-powertools/metrics/pipelines";
import { AnalyticsEngineBackend } from "@workers-powertools/metrics/analytics-engine";
```

## Setting up Cloudflare Pipelines

Metrics are written to [Cloudflare Pipelines](https://developers.cloudflare.com/pipelines/), which streams JSON records into an R2 bucket as Iceberg tables. You can then query them with [R2 SQL](https://developers.cloudflare.com/r2-sql/).

Pipelines has three components: a **stream** (receives events), a **sink** (writes to R2), and a **pipeline** (SQL transform connecting them). The stream uses a **structured schema** that validates core metric fields, while dimensions are stored in a flexible JSON column — so you can add new dimensions without recreating the stream.

### Record shape

Each metric is written as a JSON record with this shape:

```jsonc
{
  "namespace": "ecommerce", // from Metrics constructor
  "service": "orders", // from Metrics constructor
  "metric_name": "orderLatency", // from addMetric()
  "metric_unit": "Milliseconds", // from addMetric()
  "metric_value": 142, // from addMetric()
  "timestamp": "2026-04-15T10:00:00.000Z",
  "correlation_id": "req-abc123", // optional, from setCorrelationId()
  "dimensions": {
    // optional, from addMetric() dimensions
    "route": "/orders",
    "method": "POST",
  },
}
```

Core fields are typed and validated by the stream schema. Dimensions are a JSON object — add any keys you need without schema changes.

### Step 1: Create an R2 bucket

```bash
npx wrangler r2 bucket create my-metrics
```

### Step 2: Enable R2 Data Catalog on the bucket

This lets you query the data with R2 SQL later:

```bash
npx wrangler r2 bucket catalog enable my-metrics
```

Note the **Warehouse name** from the output — you'll need it for queries.

You'll also need a **Catalog API token** with R2 Admin Read & Write permissions. Create one in the dashboard under R2 → API tokens, or:

```bash
npx wrangler r2 bucket catalog token my-metrics
```

### Step 3: Create the stream schema

Copy the reference schema from the package:

```bash
cp node_modules/@workers-powertools/metrics/schema.json ./metrics-schema.json
```

The schema defines the structured core fields and a flexible `dimensions` JSON column:

```json
{
  "fields": [
    { "name": "namespace", "type": "string", "required": true },
    { "name": "service", "type": "string", "required": true },
    { "name": "metric_name", "type": "string", "required": true },
    { "name": "metric_unit", "type": "string", "required": true },
    { "name": "metric_value", "type": "float64", "required": true },
    { "name": "timestamp", "type": "timestamp", "required": true },
    { "name": "correlation_id", "type": "string", "required": false },
    { "name": "dimensions", "type": "json", "required": false }
  ]
}
```

**Why this design?** The core metric fields (name, unit, value) are always present and strongly typed — the stream validates them and rejects malformed records. Dimensions are stored as a JSON object so you can add new dimensions (e.g., `route`, `paymentMethod`, `region`) without changing the schema or recreating the stream. This mirrors the Lambda Powertools approach: the metric itself is structured, while dimensions are a flexible key-value bag.

**Customizing the schema:** If you know all your dimensions upfront and want them as typed, individually queryable columns, replace the `dimensions` JSON field with explicit columns:

```json
{
  "fields": [
    { "name": "namespace", "type": "string", "required": true },
    { "name": "service", "type": "string", "required": true },
    { "name": "metric_name", "type": "string", "required": true },
    { "name": "metric_unit", "type": "string", "required": true },
    { "name": "metric_value", "type": "float64", "required": true },
    { "name": "timestamp", "type": "timestamp", "required": true },
    { "name": "correlation_id", "type": "string", "required": false },
    { "name": "route", "type": "string", "required": false },
    { "name": "method", "type": "string", "required": false },
    { "name": "status", "type": "string", "required": false }
  ]
}
```

If you do this, you must also change `PipelinesBackend` to spread dimensions as top-level fields (see [Custom dimension mapping](#custom-dimension-mapping) below).

### Step 4: Create the stream

```bash
npx wrangler pipelines streams create metrics-stream \
  --schema-file metrics-schema.json \
  --http-enabled true \
  --http-auth false
```

Note the **stream ID** from the output — you'll need it for the Worker binding.

### Step 5: Create the sink

```bash
npx wrangler pipelines sinks create metrics-sink \
  --type r2-data-catalog \
  --bucket my-metrics \
  --namespace default \
  --table metrics \
  --catalog-token $CATALOG_TOKEN \
  --compression zstd \
  --roll-interval 60
```

| Option            | Values                   | Guidance                            |
| ----------------- | ------------------------ | ----------------------------------- |
| `--compression`   | `zstd`, `snappy`, `gzip` | `zstd` best ratio, `snappy` fastest |
| `--roll-interval` | Seconds                  | Low latency: 10–60, Query perf: 300 |

### Step 6: Create the pipeline

The pipeline connects the stream to the sink with an optional SQL transform. For simple pass-through:

```bash
npx wrangler pipelines create metrics-pipeline \
  --sql "INSERT INTO metrics_sink SELECT * FROM metrics_stream"
```

To filter or transform before writing:

```bash
npx wrangler pipelines create metrics-pipeline \
  --sql "INSERT INTO metrics_sink SELECT * FROM metrics_stream WHERE metric_name != 'debug_metric'"
```

**Pipelines are immutable** — you cannot modify the SQL after creation. To change it, delete and recreate:

```bash
npx wrangler pipelines delete metrics-pipeline
npx wrangler pipelines create metrics-pipeline --sql "..."
```

### Step 7: Add the Pipeline binding to your Worker

In `wrangler.jsonc`:

```jsonc
{
  "pipelines": [
    {
      "pipeline": "metrics-stream",
      "binding": "METRICS_PIPELINE",
    },
  ],
}
```

Or in `wrangler.toml`:

```toml
[[pipelines]]
pipeline = "metrics-stream"
binding = "METRICS_PIPELINE"
```

**Important:** Use the **stream name** (or stream ID) in the binding, not the pipeline name. Find it with:

```bash
npx wrangler pipelines streams list
```

Then redeploy:

```bash
npx wrangler deploy
```

### Quick setup (interactive)

If you prefer a guided wizard over the manual steps above:

```bash
npx wrangler pipelines setup
```

Follow the prompts:

- **Pipeline name**: e.g., `metrics-pipeline`
- **Stream configuration**: enable HTTP endpoint, no auth, JSON format, load schema from `metrics-schema.json`
- **Sink configuration**: choose **Data Catalog (Iceberg)**, select your bucket, table name `metrics`
- **SQL transformation**: choose **simple ingestion** (`INSERT INTO ... SELECT * FROM ...`)

### Query your metrics with R2 SQL

```bash
export WRANGLER_R2_SQL_AUTH_TOKEN=your-catalog-token

npx wrangler r2 sql query YOUR_WAREHOUSE "
  SELECT metric_name, metric_value, map_extract(dimensions, 'route') AS route, timestamp
  FROM default.metrics
  WHERE metric_name = 'orderLatency'
    AND __ingest_ts > NOW() - INTERVAL '1' DAY
  ORDER BY __ingest_ts DESC
  LIMIT 100
"
```

**Querying dimensions:** Since dimensions are stored as a JSON column, use R2 SQL map functions:

```sql
-- Extract a single dimension
SELECT map_extract(dimensions, 'route') AS route FROM default.metrics

-- See all dimension keys
SELECT map_keys(dimensions) AS dim_keys FROM default.metrics

-- Filter by dimension value
SELECT * FROM default.metrics
WHERE map_extract(dimensions, 'environment') = 'production'
```

If you used typed dimension columns instead of the JSON field, query them directly:

```sql
SELECT metric_name, metric_value, route, method FROM default.metrics
WHERE route = '/orders'
```

See the [R2 SQL reference](https://developers.cloudflare.com/r2-sql/sql-reference/) for full query syntax and the [complex types reference](https://developers.cloudflare.com/r2-sql/sql-reference/complex-types/) for map/struct functions.

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

## Custom dimension mapping

By default, `PipelinesBackend` nests dimensions under a `dimensions` JSON field. If you prefer dimensions as top-level columns (for direct SQL access without map functions), subclass the backend:

```typescript
import { PipelinesBackend } from "@workers-powertools/metrics";
import type { MetricEntry, MetricContext } from "@workers-powertools/metrics";

class FlatDimensionsBackend extends PipelinesBackend {
  protected buildRecords(
    entries: MetricEntry[],
    context: MetricContext,
  ): Record<string, unknown>[] {
    return entries.map((entry) => ({
      namespace: context.namespace,
      service: context.serviceName,
      metric_name: entry.name,
      metric_unit: entry.unit,
      metric_value: entry.value,
      timestamp: new Date(entry.timestamp).toISOString(),
      ...(context.correlationId && { correlation_id: context.correlationId }),
      ...entry.dimensions,
    }));
  }
}
```

Use this with a schema that declares each dimension as a typed column (see [Step 3](#step-3-create-the-stream-schema)).

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
