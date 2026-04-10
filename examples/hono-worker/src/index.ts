/**
 * Hono Worker example — Simple Items API
 *
 * The same Items API as vanilla-worker, built with Hono.
 * Compare the DX: middleware replaces per-handler boilerplate,
 * and the Hono adapter packages handle context wiring automatically.
 *
 *   GET  /items        — list all items
 *   POST /items        — create an item (idempotent via Idempotency-Key header)
 *   GET  /items/:id    — get a single item
 *
 * ─── HOW TO INTEGRATE POWERTOOLS ────────────────────────────────────────────
 *
 * Step 1 — Logger via middleware
 *   import { Logger } from "@workers-powertools/logger";
 *   import { injectLogger } from "@workers-powertools/hono";
 *   const logger = new Logger({ serviceName: "hono-worker", logLevel: "INFO" });
 *   app.use(injectLogger(logger));   ← one line, all routes enriched automatically
 *   In handlers: use logger.info / logger.warn / logger.error directly.
 *
 * Step 2 — Tracer via middleware
 *   import { Tracer } from "@workers-powertools/tracer";
 *   import { injectTracer } from "@workers-powertools/hono";
 *   const tracer = new Tracer({ serviceName: "hono-worker" });
 *   app.use(injectTracer(tracer));   ← wraps every handler in a named span
 *
 * Step 3 — Metrics via middleware
 *   import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";
 *   import { injectMetrics } from "@workers-powertools/hono";
 *   const metrics = new Metrics(); // namespace from POWERTOOLS_METRICS_NAMESPACE env var
 *   app.use(injectMetrics(metrics, {
 *     backendFactory: (env) => new PipelinesBackend({ binding: env.METRICS_PIPELINE }),
 *   }));
 *   For custom metrics (e.g. itemCreated), call metrics.addMetric() in handlers.
 *   Requires: "pipelines" binding in wrangler.jsonc.
 *
 * Step 4 — Idempotency via middleware (POST /items only)
 *   import { injectIdempotency } from "@workers-powertools/hono";
 *   import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";
 *   Apply only to POST /items:
 *     app.post("/items", injectIdempotency({ persistenceLayer, config }), handler)
 *   Requires: "kv_namespaces" binding in wrangler.jsonc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Hono } from "hono";

import { Logger } from "@workers-powertools/logger";
import { Tracer } from "@workers-powertools/tracer";
import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";
import type { PipelineBinding } from "@workers-powertools/metrics";
import {
  injectLogger,
  injectTracer,
  injectMetrics,
  injectIdempotency,
} from "@workers-powertools/hono";
import { IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

export interface Env {
  // POWERTOOLS_SERVICE_NAME, POWERTOOLS_LOG_LEVEL, POWERTOOLS_METRICS_NAMESPACE
  // set as vars in wrangler.jsonc — applied automatically by the middleware.
  METRICS_PIPELINE: PipelineBinding;
  IDEMPOTENCY_KV: KVNamespace;
}

// serviceName / logLevel / namespace omitted — resolved from env vars at runtime:
//   POWERTOOLS_SERVICE_NAME, POWERTOOLS_LOG_LEVEL, POWERTOOLS_METRICS_NAMESPACE
const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

// In-memory store — replace with a real binding (KV, D1) as desired
const items = new Map<string, { id: string; name: string; createdAt: string }>();

// Lazily initialised on first request — env bindings are only available
// inside a handler, not at module scope.
let persistenceLayer: KVPersistenceLayer | undefined;

const idempotencyConfig = new IdempotencyConfig({
  eventKeyPath: "$",
  expiresAfterSeconds: 3600,
});

const app = new Hono<{ Bindings: Env }>();

app.use(injectLogger(logger));
app.use(injectTracer(tracer));
// injectMetrics defaults to env.METRICS_PIPELINE (PipelinesBackend).
// Override with backendFactory for a custom binding name or backend type.
app.use(
  injectMetrics(metrics, {
    backendFactory: (env) =>
      new PipelinesBackend({ binding: env["METRICS_PIPELINE"] as PipelineBinding }),
  }),
);

// GET /items
app.get("/items", (c) => {
  const all = Array.from(items.values());
  logger.info("Listed items", { count: all.length });
  return c.json(all);
});

// POST /items — idempotency middleware applied to this route only.
// injectIdempotency checks the Idempotency-Key header before the handler
// runs. Duplicate requests with the same key return the stored response
// without re-executing the handler. Concurrent duplicates receive 409.
app.post(
  "/items",
  // Initialise the persistence layer from c.env on first request,
  // then pass it to injectIdempotency as a resolved options object.
  async (c, next) => {
    persistenceLayer ??= new KVPersistenceLayer({ binding: c.env.IDEMPOTENCY_KV });
    return injectIdempotency({ persistenceLayer, config: idempotencyConfig })(c, next);
  },
  async (c) => {
    const body = await c.req.json<{ name?: string }>();

    if (!body.name) {
      return c.json({ error: "Missing required field: name" }, 400);
    }

    const id = crypto.randomUUID();
    const item = { id, name: body.name, createdAt: new Date().toISOString() };
    items.set(id, item);

    logger.info("Item created", { itemId: id });
    metrics.addMetric("itemCreated", MetricUnit.Count, 1);

    return c.json(item, 201);
  },
);

// GET /items/:id
app.get("/items/:id", (c) => {
  const id = c.req.param("id");
  const item = items.get(id);

  if (!item) {
    logger.warn("Item not found", { itemId: id });
    return c.json({ error: "Not Found" }, 404);
  }

  return c.json(item);
});

export default app;
