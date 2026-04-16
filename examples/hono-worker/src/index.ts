/**
 * Hono Worker example — Simple Items API
 *
 * The same Items API as vanilla-worker, built with Hono.
 * Compare the DX: Hono middleware handles cross-cutting concerns while
 * @tracer.captureMethod() decorates individual service methods.
 *
 *   GET  /items        — list all items
 *   POST /items        — create an item (idempotent via Idempotency-Key header)
 *   GET  /items/:id    — get a single item
 *
 * ─── POWERTOOLS INTEGRATION ──────────────────────────────────────────────────
 *
 * Logger  — injectLogger middleware calls addContext on every request.
 *           Env vars (POWERTOOLS_SERVICE_NAME etc.) applied automatically.
 *
 * Tracer  — injectTracer wraps every Hono handler in a route-level span.
 *           @tracer.captureMethod() adds finer-grained service-method spans
 *           nested inside the route span — producing a two-level span tree
 *           with no manual captureAsync() calls. TC39 Stage 3 decorator
 *           syntax enabled via experimentalDecorators: false in tsconfig.json.
 *
 * Metrics — injectMetrics resolves PipelinesBackend from env.METRICS_PIPELINE
 *           and flushes after every response.
 *
 * Idempotency — injectIdempotency applied per-route to POST /items only.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Hono } from "hono";

import { Logger } from "@workers-powertools/logger";
import { Tracer } from "@workers-powertools/tracer";
import { Metrics, MetricUnit } from "@workers-powertools/metrics";
import { PipelinesBackend } from "@workers-powertools/metrics/pipelines";
import type { PipelineBinding } from "@workers-powertools/metrics/pipelines";
import { injectIdempotency } from "@workers-powertools/hono/idempotency";
import { injectLogger } from "@workers-powertools/hono/logger";
import { injectMetrics } from "@workers-powertools/hono/metrics";
import { injectTracer } from "@workers-powertools/hono/tracer";
import { IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

export interface Env {
  // POWERTOOLS_SERVICE_NAME, POWERTOOLS_LOG_LEVEL, POWERTOOLS_METRICS_NAMESPACE
  // set as vars in wrangler.jsonc — applied automatically by the middleware.
  METRICS_PIPELINE: PipelineBinding;
  IDEMPOTENCY_KV: KVNamespace;
}

type Item = { id: string; name: string; createdAt: string };

// serviceName / logLevel / namespace resolved from env vars at runtime.
const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

// Lazily initialised on first request — env bindings unavailable at module scope.
let persistenceLayer: KVPersistenceLayer | undefined;

const idempotencyConfig = new IdempotencyConfig({
  eventKeyPath: "$",
  expiresAfterSeconds: 3600,
});

/**
 * ItemService encapsulates the business logic for the items resource.
 *
 * @tracer.captureMethod() decorates each method with a named span:
 *   "ItemService.list", "ItemService.create", "ItemService.getById"
 *
 * These are nested inside the route-level span created by injectTracer,
 * giving a two-level span tree per request:
 *   GET /items
 *     └── ItemService.list
 *
 * TC39 Stage 3 decorator syntax — requires experimentalDecorators: false
 * and target: ES2022 in tsconfig.json (see tsconfig.json).
 */
class ItemService {
  // In-memory store — replace with KV or D1 in production.
  private readonly store = new Map<string, Item>();

  @tracer.captureMethod()
  async list(): Promise<Item[]> {
    const all = Array.from(this.store.values());
    logger.info("Listed items", { count: all.length });
    return all;
  }

  @tracer.captureMethod()
  async create(name: string): Promise<Item> {
    const id = crypto.randomUUID();
    const item: Item = { id, name, createdAt: new Date().toISOString() };
    this.store.set(id, item);
    logger.info("Item created", { itemId: id });
    metrics.addMetric("itemCreated", MetricUnit.Count, 1, {
      route: "/items",
      method: "POST",
    });
    return item;
  }

  @tracer.captureMethod()
  async getById(id: string): Promise<Item | undefined> {
    const item = this.store.get(id);
    if (!item) logger.warn("Item not found", { itemId: id });
    return item;
  }
}

const service = new ItemService();

const app = new Hono<{ Bindings: Env }>();

// ── Global middleware ────────────────────────────────────────────────────────
// Ordered: logger first (correlation ID available to all downstream),
// then tracer (route-level span wraps handler + service spans),
// then metrics (records duration after handler + service complete).
app.use(injectLogger(logger));
app.use(injectTracer(tracer));
app.use(
  injectMetrics(metrics, {
    backendFactory: (env) =>
      new PipelinesBackend({ binding: env["METRICS_PIPELINE"] as PipelineBinding }),
  }),
);

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /items
// Span tree: "GET /items" → "ItemService.list"
app.get("/items", async (c) => {
  return c.json(await service.list());
});

// POST /items — idempotency middleware guards this route only.
// Span tree: "POST /items" → "ItemService.create" (first execution only)
app.post(
  "/items",
  async (c, next) => {
    persistenceLayer ??= new KVPersistenceLayer({ binding: c.env.IDEMPOTENCY_KV });
    return injectIdempotency({ persistenceLayer, config: idempotencyConfig })(c, next);
  },
  async (c) => {
    const body = await c.req.json<{ name?: string }>();
    if (!body.name) {
      return c.json({ error: "Missing required field: name" }, 400);
    }
    return c.json(await service.create(body.name), 201);
  },
);

// GET /items/:id
// Span tree: "GET /items/:id" → "ItemService.getById"
app.get("/items/:id", async (c) => {
  const item = await service.getById(c.req.param("id"));
  return item ? c.json(item) : c.json({ error: "Not Found" }, 404);
});

export default app;
