/**
 * Hono Worker example — Simple Items API
 *
 * The same Items API as vanilla-worker, built with Hono.
 * Compare the DX: Hono middleware handles cross-cutting concerns while
 * wide events accumulate per-request context into a single log entry.
 *
 *   GET  /items        — list all items
 *   POST /items        — create an item (idempotent via Idempotency-Key header)
 *   GET  /items/:id    — get a single item
 *
 * ─── POWERTOOLS INTEGRATION ──────────────────────────────────────────────────
 *
 * Logger  — injectLogger middleware calls addContext on every request.
 *           Env vars (POWERTOOLS_SERVICE_NAME etc.) applied automatically.
 *           wideEvent: true creates a request-scoped WideEvent accessible via
 *           c.get("wideEvent") that auto-emits after the handler completes.
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
import { Metrics, MetricUnit } from "@workers-powertools/metrics";
import { PipelinesBackend } from "@workers-powertools/metrics/pipelines";
import type { PipelineBinding } from "@workers-powertools/metrics/pipelines";
import { injectIdempotency } from "@workers-powertools/hono/idempotency";
import { injectLogger } from "@workers-powertools/hono/logger";
import { injectMetrics } from "@workers-powertools/hono/metrics";
import type { WideEventVariables } from "@workers-powertools/hono/logger";
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
 * Methods are plain async functions — timing and context are captured
 * by the wide event on the outer handler instead of per-method spans.
 */
class ItemService {
  // In-memory store — replace with KV or D1 in production.
  private readonly store = new Map<string, Item>();

  async list(): Promise<Item[]> {
    return Array.from(this.store.values());
  }

  async create(name: string): Promise<Item> {
    const id = crypto.randomUUID();
    const item: Item = { id, name, createdAt: new Date().toISOString() };
    this.store.set(id, item);
    metrics.addMetric("itemCreated", MetricUnit.Count, 1, {
      route: "/items",
      method: "POST",
    });
    return item;
  }

  async getById(id: string): Promise<Item | undefined> {
    return this.store.get(id);
  }
}

const service = new ItemService();

const app = new Hono<{ Bindings: Env; Variables: WideEventVariables }>();

// ── Global middleware ────────────────────────────────────────────────────────
// Ordered: logger first (correlation ID + wide event available to all downstream),
// then metrics (records duration after handler complete).
// wideEvent: true creates a request-scoped event that auto-emits on response.
app.use(injectLogger(logger, { wideEvent: true }));
app.use(
  injectMetrics(metrics, {
    backendFactory: (env) =>
      new PipelinesBackend({ binding: env["METRICS_PIPELINE"] as PipelineBinding }),
  }),
);

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /items
app.get("/items", async (c) => {
  const items = await service.list();
  c.get("wideEvent").set({ itemCount: items.length });
  return c.json(items);
});

// POST /items — idempotency middleware guards this route only.
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
    const item = await service.create(body.name);
    c.get("wideEvent").set({ itemId: item.id, action: "create" });
    return c.json(item, 201);
  },
);

// GET /items/:id
app.get("/items/:id", async (c) => {
  const item = await service.getById(c.req.param("id"));
  if (!item) {
    c.get("wideEvent").set({ itemId: c.req.param("id"), found: false });
    return c.json({ error: "Not Found" }, 404);
  }
  c.get("wideEvent").set({ itemId: item.id, found: true });
  return c.json(item);
});

export default app;
