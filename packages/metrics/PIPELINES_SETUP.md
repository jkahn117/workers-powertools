# Setting up Cloudflare Pipelines for @workers-powertools/metrics

This guide walks through creating the Pipelines infrastructure that `PipelinesBackend` writes to. It is intended for both developers and AI coding assistants setting up metrics in a Worker project.

## Record shape

`PipelinesBackend` writes JSON records with this shape:

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

## Deployment sequence

Pipelines has three components that must be created in order:

1. **R2 bucket** + Data Catalog
2. **Stream** (with schema)
3. **Sink** (writes to R2/Iceberg)
4. **Pipeline** (SQL transform connecting stream → sink)
5. **Worker binding** + deploy

### Step 1: Create an R2 bucket and enable Data Catalog

```bash
npx wrangler r2 bucket create my-metrics
npx wrangler r2 bucket catalog enable my-metrics
```

Note the **Warehouse name** from the output — needed for queries later.

Create a Catalog API token with R2 Admin Read & Write permissions (dashboard → R2 → API tokens).

### Step 2: Create the stream with the reference schema

Copy the reference schema from the installed package:

```bash
cp node_modules/@workers-powertools/metrics/schema.json ./metrics-schema.json
```

Then create the stream:

```bash
npx wrangler pipelines streams create metrics-stream \
  --schema-file metrics-schema.json \
  --http-enabled true \
  --http-auth false
```

Note the **stream ID** from the output — needed for the Worker binding.

### Step 3: Create the sink

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

### Step 4: Create the pipeline

```bash
npx wrangler pipelines create metrics-pipeline \
  --sql "INSERT INTO metrics_sink SELECT * FROM metrics_stream"
```

Pipelines are immutable — to change the SQL, delete and recreate:

```bash
npx wrangler pipelines delete metrics-pipeline
npx wrangler pipelines create metrics-pipeline --sql "..."
```

### Step 5: Add the binding and deploy

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

**Important:** Use the **stream name** (or stream ID) in the binding, not the pipeline name. Find it with:

```bash
npx wrangler pipelines streams list
```

Then redeploy:

```bash
npx wrangler deploy
```

## Quick setup (interactive)

```bash
npx wrangler pipelines setup
```

Follow the prompts — enable HTTP endpoint, no auth, load schema from `metrics-schema.json`, choose Data Catalog (Iceberg) sink.

## Schema design

The reference schema uses a `dimensions` JSON field:

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

**Why `dimensions` as JSON?** The stream schema stays stable — adding new dimensions does not require recreating the stream. Query dimensions with R2 SQL map functions:

```sql
SELECT map_extract(dimensions, 'route') AS route FROM default.metrics
SELECT * FROM default.metrics WHERE map_extract(dimensions, 'environment') = 'production'
```

**Alternative: typed dimension columns.** If you know all dimensions upfront and want direct SQL access without map functions, replace the `dimensions` field with typed columns:

```json
{ "name": "route", "type": "string", "required": false },
{ "name": "method", "type": "string", "required": false }
```

If you do this, you must also subclass `PipelinesBackend` to spread dimensions as top-level fields instead of nesting them. See the README's "Custom dimension mapping" section.

## Querying metrics with R2 SQL

```bash
export WRANGLER_R2_SQL_AUTH_TOKEN=your-catalog-token

npx wrangler r2 sql query YOUR_WAREHOUSE "
  SELECT metric_name, metric_value,
         map_extract(dimensions, 'route') AS route,
         timestamp
  FROM default.metrics
  WHERE metric_name = 'orderLatency'
    AND __ingest_ts > NOW() - INTERVAL '1' DAY
  ORDER BY __ingest_ts DESC
  LIMIT 100
"
```

## Common pitfalls

| Pitfall                                               | What happens                                                     | Fix                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Using pipeline name instead of stream name in binding | `env.METRICS_PIPELINE is undefined`                              | Use stream name/ID from `wrangler pipelines streams list`       |
| Missing schema on stream                              | Unstructured stream, all data in `value` column                  | Create stream with `--schema-file schema.json`                  |
| Schema doesn't match record shape                     | Events silently dropped (HTTP 200, no data in R2)                | Schema fields must match exactly what `PipelinesBackend` writes |
| Not waiting for roll interval                         | "No data in R2" immediately after sending                        | Wait 10–300 seconds depending on `--roll-interval`              |
| Modifying pipeline SQL                                | Error: pipelines are immutable                                   | Delete and recreate the pipeline                                |
| Adding new top-level dimension column                 | Requires schema change → stream recreation → pipeline recreation | Use the `dimensions` JSON field instead                         |

## Checklist

- [ ] R2 bucket exists and Data Catalog is enabled
- [ ] Stream created with `--schema-file` pointing to the metrics schema
- [ ] Sink created pointing to the R2 bucket with Iceberg format
- [ ] Pipeline created with SQL connecting stream → sink
- [ ] Worker binding uses the **stream name** (not pipeline name)
- [ ] `PipelinesBackend` is constructed with `env.METRICS_PIPELINE`
- [ ] `ctx.waitUntil(metrics.flush())` is called in fetch handlers
- [ ] `autoFlush: true` is used in alarm/queue handlers
