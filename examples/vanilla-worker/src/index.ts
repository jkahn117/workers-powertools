/**
 * Vanilla Worker example — Simple Items API
 *
 * Demonstrates Workers Powertools without a framework.
 * The API has three routes handled via manual URL routing:
 *
 *   GET  /items        — list all items
 *   POST /items        — create an item (idempotent via Idempotency-Key header)
 *   GET  /items/:id    — get a single item
 *
 * ─── POWERTOOLS INTEGRATION ──────────────────────────────────────────────────
 *
 * Logger  — addContext(request, ctx, env) enriches all logs with CF properties,
 *           correlation ID, and runtime env vars (POWERTOOLS_SERVICE_NAME etc.)
 *
 * Tracer  — @tracer.captureMethod() wraps each ItemService method in a named
 *           span automatically. TC39 Stage 3 decorator syntax is enabled via
 *           experimentalDecorators: false in tsconfig.json — esbuild/wrangler
 *           lowers the syntax at bundle time.
 *
 * Metrics — PipelinesBackend writes named-field JSON records to Cloudflare
 *           Pipelines → R2/Iceberg, queryable by column name via R2 SQL.
 *
 * Idempotency — makeIdempotent() wraps ItemService.create so duplicate POSTs
 *               with the same Idempotency-Key header return the stored result.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Logger } from "@workers-powertools/logger";
import { Tracer } from "@workers-powertools/tracer";
import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";
import type { PipelineBinding } from "@workers-powertools/metrics";
import { makeIdempotent, IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

export interface Env {
  // POWERTOOLS_SERVICE_NAME, POWERTOOLS_LOG_LEVEL, POWERTOOLS_METRICS_NAMESPACE
  // are set as vars in wrangler.jsonc and applied via addContext(..., env).
  METRICS_PIPELINE: PipelineBinding;
  IDEMPOTENCY_KV: KVNamespace;
}

type Item = { id: string; name: string; createdAt: string };
type CreateItemEvent = { idempotencyKey: string; name: string };

// serviceName / logLevel / namespace resolved from env vars at runtime.
const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

// Lazily initialised on first request — env bindings unavailable at module scope.
let persistenceLayer: KVPersistenceLayer | undefined;

const idempotencyConfig = new IdempotencyConfig({
  eventKeyPath: "idempotencyKey",
  expiresAfterSeconds: 3600,
});

/**
 * ItemService encapsulates the business logic for the items resource.
 *
 * Each method is decorated with @tracer.captureMethod(), which automatically
 * wraps it in a named span: "ItemService.list", "ItemService.create",
 * "ItemService.getById". No manual captureAsync() boilerplate required.
 *
 * TC39 Stage 3 decorator syntax — requires experimentalDecorators: false
 * and target: ES2022 in tsconfig.json so esbuild lowers the syntax at
 * bundle time (see tsconfig.json).
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
  async create(event: CreateItemEvent): Promise<Item> {
    const id = crypto.randomUUID();
    const item: Item = { id, name: event.name, createdAt: new Date().toISOString() };
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

// makeIdempotent wraps service.create. The span from @tracer.captureMethod()
// only fires on first execution — duplicate requests short-circuit before
// re-entering the method, so no orphaned spans on cache hits.
const createItemIdempotent = makeIdempotent(
  (event: CreateItemEvent) => service.create(event),
  {
    get persistenceLayer() {
      if (!persistenceLayer)
        throw new Error("Idempotency persistence layer not initialised");
      return persistenceLayer;
    },
    config: idempotencyConfig,
  },
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { method } = request;
    const path = url.pathname;

    // Apply runtime env-var config (POWERTOOLS_SERVICE_NAME, POWERTOOLS_LOG_LEVEL).
    logger.addContext(request, ctx, env as unknown as Record<string, unknown>);
    tracer.addContext(request, ctx, env as unknown as Record<string, unknown>);
    metrics.setBackend(new PipelinesBackend({ binding: env.METRICS_PIPELINE }));

    try {
      if (method === "GET" && path === "/items") {
        return Response.json(await service.list());
      }

      if (method === "POST" && path === "/items") {
        const body = (await request.json()) as { name?: string };
        if (!body.name) {
          return new Response("Missing required field: name", { status: 400 });
        }
        persistenceLayer ??= new KVPersistenceLayer({ binding: env.IDEMPOTENCY_KV });
        const idempotencyKey = request.headers.get("Idempotency-Key") ?? body.name;
        const item = await createItemIdempotent({ idempotencyKey, name: body.name });
        return Response.json(item, { status: 201 });
      }

      const itemMatch = path.match(/^\/items\/([^/]+)$/);
      if (method === "GET" && itemMatch) {
        const item = await service.getById(itemMatch[1] ?? "");
        return item ? Response.json(item) : new Response("Not Found", { status: 404 });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      logger.error("Unhandled error", error as Error);
      return new Response("Internal Server Error", { status: 500 });
    } finally {
      ctx.waitUntil(metrics.flush());
    }
  },
} satisfies ExportedHandler<Env>;
